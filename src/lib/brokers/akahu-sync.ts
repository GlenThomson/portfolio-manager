/**
 * Akahu investment account sync — extracted so it can be called from:
 *  - /api/brokers/akahu/sync (user-triggered, request scope)
 *  - /api/cron/daily-digest (background, all users with connections)
 *
 * Takes any Supabase client (user-context or service-role) so the same code
 * works for both flows.
 */
import { fetchInvestmentAccounts, getPersonalUserToken } from "@/lib/brokers/akahu"
import { resolveTickersBatch } from "@/lib/brokers/ticker-resolver"
import { nudgeNewPosition } from "@/lib/digest/nudge"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface AkahuSyncResult {
  imported: number
  skipped: number
  closed?: number
  total: number
  unresolved: string[]
  needsMapping?: boolean
  message?: string
}

export async function syncAkahuInvestments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  portfolioId: string,
  tickerOverrides: Record<string, string> = {},
): Promise<AkahuSyncResult> {
  // Try DB connection first, then fall back to personal env token
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "akahu")
    .limit(1)
    .single()

  const accessToken = connection?.access_token ?? getPersonalUserToken()
  if (!accessToken) {
    throw new Error("No Akahu connection found")
  }

  const appTokenOverride = connection?.account_id ?? undefined

  // 1. Fetch holdings from Akahu
  const { holdings } = await fetchInvestmentAccounts(accessToken, appTokenOverride ?? undefined)

  if (holdings.length === 0) {
    return { imported: 0, skipped: 0, total: 0, unresolved: [], message: "No investment holdings" }
  }

  // 2. Resolve ticker symbols
  const holdingsToResolve = holdings
    .filter((h) => !tickerOverrides[h.name])
    .map((h) => ({ name: h.name, ticker: h.ticker, code: h.code, symbol: h.symbol }))

  const resolved = await resolveTickersBatch(holdingsToResolve)

  for (const [name, symbol] of Object.entries(tickerOverrides)) {
    resolved.set(name, { originalName: name, symbol, confidence: "high", source: "static" })
  }

  // 3. Separate resolved vs unresolved
  const unresolved: string[] = []
  const resolvedHoldings = holdings.map((h) => {
    const ticker = resolved.get(h.name)
    if (!ticker?.symbol) {
      unresolved.push(h.name)
      return null
    }
    return { ...h, symbol: ticker.symbol }
  }).filter(Boolean) as (typeof holdings[0] & { symbol: string })[]

  if (unresolved.length > 0 && resolvedHoldings.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      total: holdings.length,
      unresolved,
      needsMapping: true,
      message: "Could not resolve ticker symbols. Please map them manually.",
    }
  }

  // 4. Import resolved holdings
  let imported = 0
  let skipped = 0

  for (const holding of resolvedHoldings) {
    const brokerRef = `akahu-${holding.accountId}-${holding.symbol}`

    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("broker_ref", brokerRef)
      .limit(1)
      .single()

    if (existingTx) {
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", holding.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      if (existingPos) {
        await supabase
          .from("portfolio_positions")
          .update({
            quantity: holding.quantity.toString(),
            average_cost: holding.pricePerUnit.toString(),
            // Akahu sync now claims ownership — overwrites any earlier guess
            source: "akahu",
          })
          .eq("id", existingPos.id)
      }
      skipped++
      continue
    }

    const { data: existingPos } = await supabase
      .from("portfolio_positions")
      .select("id, quantity, average_cost")
      .eq("portfolio_id", portfolioId)
      .eq("symbol", holding.symbol)
      .is("closed_at", null)
      .limit(1)
      .single()

    if (existingPos) {
      await supabase
        .from("portfolio_positions")
        .update({
          quantity: holding.quantity.toString(),
          average_cost: holding.pricePerUnit.toString(),
          source: "akahu",
        })
        .eq("id", existingPos.id)
    } else {
      await supabase.from("portfolio_positions").insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol: holding.symbol,
        quantity: holding.quantity.toString(),
        average_cost: holding.pricePerUnit.toString(),
        asset_type: "stock",
        source: "akahu",
      })
      nudgeNewPosition(userId, holding.symbol, supabase)
    }

    await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      user_id: userId,
      symbol: holding.symbol,
      action: "buy",
      quantity: holding.quantity.toString(),
      price: holding.pricePerUnit.toString(),
      broker_ref: brokerRef,
    })

    imported++
  }

  // ── Close positions that Akahu no longer reports ──────────────────
  // Source-based: any open position with source = 'akahu' whose symbol isn't
  // in Akahu's current response was sold. Manual/csv/ibkr positions are left
  // alone — they belong to a different sync mechanism (or are user-managed).
  const currentSymbols = new Set(resolvedHoldings.map((h) => h.symbol))

  const { data: openAkahuPositions } = await supabase
    .from("portfolio_positions")
    .select("id, symbol")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .eq("source", "akahu")
    .is("closed_at", null)

  let closed = 0
  for (const pos of openAkahuPositions ?? []) {
    if (currentSymbols.has(pos.symbol)) continue

    await supabase
      .from("portfolio_positions")
      .update({
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pos.id)
    closed++
  }

  // Update last_sync_at on connection
  if (connection) {
    await supabase
      .from("broker_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id)
  }

  return { imported, skipped, closed, total: holdings.length, unresolved }
}

/**
 * Cron-friendly: sync investments for all users with active Akahu connections.
 * Auto-discovers each user's first portfolio.
 */
export async function syncAkahuForAllUsers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ synced: number; failed: number; details: Array<{ userId: string; status: string; imported?: number }> }> {
  const { data: connections } = await supabase
    .from("broker_connections")
    .select("user_id, access_token, account_id")
    .eq("broker", "akahu")

  const details: Array<{ userId: string; status: string; imported?: number }> = []
  let synced = 0
  let failed = 0

  for (const conn of connections ?? []) {
    if (!conn.access_token) {
      details.push({ userId: conn.user_id, status: "no_access_token" })
      continue
    }

    // Find the user's first portfolio
    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", conn.user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single()

    if (!portfolio) {
      details.push({ userId: conn.user_id, status: "no_portfolio" })
      continue
    }

    try {
      const result = await syncAkahuInvestments(supabase, conn.user_id, portfolio.id)
      details.push({ userId: conn.user_id, status: "ok", imported: result.imported })
      synced++
    } catch (err) {
      console.error(`Akahu sync failed for ${conn.user_id}:`, err)
      details.push({ userId: conn.user_id, status: "error" })
      failed++
    }
  }

  return { synced, failed, details }
}

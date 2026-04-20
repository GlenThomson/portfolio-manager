import { NextRequest, NextResponse } from "next/server"
import { fetchInvestmentAccounts, getPersonalUserToken } from "@/lib/brokers/akahu"
import { resolveTickersBatch } from "@/lib/brokers/ticker-resolver"
import { createClient, getServerUserId } from "@/lib/supabase/server"
import { nudgeNewPosition } from "@/lib/digest/nudge"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId, tickerOverrides } = await request.json()
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

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
    return NextResponse.json(
      { error: "No Akahu connection found. Please connect first." },
      { status: 404 }
    )
  }

  // Per-user app token (stored in account_id field) or fall back to env
  const appTokenOverride = connection?.account_id ?? undefined

  try {
    // 1. Fetch holdings from Akahu
    const { holdings } = await fetchInvestmentAccounts(accessToken, appTokenOverride ?? undefined)

    if (holdings.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: 0,
        unresolved: [],
        message: "No investment holdings found in connected accounts",
      })
    }

    // 2. Resolve ticker symbols (Akahu/Sharesies provides symbol directly)
    const overrides: Record<string, string> = tickerOverrides ?? {}
    const holdingsToResolve = holdings
      .filter((h) => !overrides[h.name])
      .map((h) => ({ name: h.name, ticker: h.ticker, code: h.code, symbol: h.symbol }))

    const resolved = await resolveTickersBatch(holdingsToResolve)

    // Merge overrides
    for (const [name, symbol] of Object.entries(overrides)) {
      resolved.set(name, {
        originalName: name,
        symbol,
        confidence: "high",
        source: "static",
      })
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

    // If there are unresolved holdings, return them for manual mapping
    if (unresolved.length > 0 && resolvedHoldings.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: holdings.length,
        unresolved,
        needsMapping: true,
        message: "Could not resolve ticker symbols. Please map them manually.",
      })
    }

    // 4. Import resolved holdings
    let imported = 0
    let skipped = 0

    for (const holding of resolvedHoldings) {
      const brokerRef = `akahu-${holding.accountId}-${holding.symbol}`

      // Dedup check
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("broker_ref", brokerRef)
        .limit(1)
        .single()

      if (existingTx) {
        // Update existing position quantity (Akahu gives current state)
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
            })
            .eq("id", existingPos.id)
        }
        skipped++
        continue
      }

      // Upsert position
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity, average_cost")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", holding.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      if (existingPos) {
        // Akahu gives us current state, so replace rather than accumulate
        await supabase
          .from("portfolio_positions")
          .update({
            quantity: holding.quantity.toString(),
            average_cost: holding.pricePerUnit.toString(),
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
        })
        // Nudge user to add a plan for this new holding (non-blocking)
        nudgeNewPosition(userId, holding.symbol, supabase)
      }

      // Record transaction for audit trail
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

    // Update last sync time (only if we have a DB connection)
    if (connection) {
      await supabase
        .from("broker_connections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", connection.id)
    }

    return NextResponse.json({
      imported,
      skipped,
      total: holdings.length,
      unresolved: unresolved.length > 0 ? unresolved : undefined,
    })
  } catch (error) {
    console.error("Akahu sync error:", error)
    return NextResponse.json({ error: "Failed to sync positions" }, { status: 500 })
  }
}

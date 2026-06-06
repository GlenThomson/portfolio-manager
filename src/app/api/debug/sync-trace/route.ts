import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchInvestmentAccounts } from "@/lib/brokers/akahu"
import { resolveTickersBatch } from "@/lib/brokers/ticker-resolver"

export const maxDuration = 60

/**
 * Dry-run of the Akahu investment sync — no DB writes. Returns a verbose trace
 * showing exactly what the sync sees for each position.
 * Usage: /api/debug/sync-trace?portfolioId=<uuid>
 */
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  let portfolioId = url.searchParams.get("portfolioId")
  if (!portfolioId) {
    const { data: ps } = await supabase
      .from("portfolios").select("id").eq("user_id", user.id).order("created_at").limit(1)
    portfolioId = ps?.[0]?.id ?? null
  }
  if (!portfolioId) return NextResponse.json({ error: "No portfolio" }, { status: 400 })

  const { data: conn } = await supabase
    .from("broker_connections").select("access_token, account_id, last_sync_at")
    .eq("user_id", user.id).eq("broker", "akahu").limit(1).single()
  if (!conn?.access_token) return NextResponse.json({ error: "No Akahu connection" }, { status: 404 })

  // 1. Fetch raw from Akahu
  const { holdings: rawHoldings, accounts: investmentAccounts } = await fetchInvestmentAccounts(
    conn.access_token, conn.account_id ?? undefined,
  )

  // 2. Resolve tickers (same logic as real sync)
  const resolved = await resolveTickersBatch(
    rawHoldings.map((h) => ({ name: h.name, ticker: h.ticker, code: h.code, symbol: h.symbol })),
  )
  const resolvedHoldings = rawHoldings.map((h) => {
    const r = resolved.get(h.name)
    return { ...h, resolvedSymbol: r?.symbol ?? null, originalName: h.name }
  })
  const currentSymbols = new Set(resolvedHoldings.filter((h) => h.resolvedSymbol).map((h) => h.resolvedSymbol!))

  // 3. Get open positions in DB
  const { data: openPositions } = await supabase
    .from("portfolio_positions")
    .select("id, symbol, quantity, average_cost, opened_at")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", user.id)
    .is("closed_at", null)

  // 4. For each open position, run the close-decision logic
  const positionDecisions = await Promise.all((openPositions ?? []).map(async (pos) => {
    const inAkahu = currentSymbols.has(pos.symbol)

    // Check for any Akahu transaction
    const { data: akahuTxs, error: txErr } = await supabase
      .from("transactions")
      .select("id, broker_ref, executed_at")
      .eq("portfolio_id", portfolioId)
      .eq("symbol", pos.symbol)
      .like("broker_ref", "akahu-%")
      .order("executed_at", { ascending: false })
      .limit(3)

    const hasAkahuTx = (akahuTxs?.length ?? 0) > 0

    let decision: string
    if (inAkahu) decision = "KEEP — Akahu still reports this symbol"
    else if (!hasAkahuTx) decision = `SKIP — no Akahu transaction found (manual/CSV import). To close: use the trash button.`
    else decision = "CLOSE — should be closed by sync"

    return {
      symbol: pos.symbol,
      quantity: parseFloat(pos.quantity),
      openedAt: pos.opened_at,
      inAkahuResponse: inAkahu,
      hasAkahuTransaction: hasAkahuTx,
      sampleAkahuTxRefs: akahuTxs?.map((t) => t.broker_ref) ?? [],
      txQueryError: txErr?.message ?? null,
      decision,
    }
  }))

  return NextResponse.json({
    portfolioId,
    lastSyncAt: conn.last_sync_at,
    summary: {
      akahuInvestmentAccounts: investmentAccounts.length,
      akahuHoldingsRaw: rawHoldings.length,
      akahuHoldingsResolved: resolvedHoldings.filter((h) => h.resolvedSymbol).length,
      uniqueAkahuSymbols: currentSymbols.size,
      openPositionsInDb: openPositions?.length ?? 0,
      wouldClose: positionDecisions.filter((d) => d.decision.startsWith("CLOSE")).length,
      wouldSkip: positionDecisions.filter((d) => d.decision.startsWith("SKIP")).length,
      wouldKeep: positionDecisions.filter((d) => d.decision.startsWith("KEEP")).length,
    },
    akahuAccounts: investmentAccounts.map((a) => ({ name: a.name, balance: a.balance, type: a.type })),
    akahuHoldings: resolvedHoldings.map((h) => ({
      originalName: h.originalName,
      resolvedSymbol: h.resolvedSymbol,
      quantity: h.quantity,
      pricePerUnit: h.pricePerUnit,
    })),
    positionDecisions,
  })
}

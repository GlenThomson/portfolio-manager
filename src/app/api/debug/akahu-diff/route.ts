import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchInvestmentAccounts } from "@/lib/brokers/akahu"
import { resolveTickersBatch } from "@/lib/brokers/ticker-resolver"

export const maxDuration = 60

/**
 * Diagnostic: shows current Akahu holdings vs DB portfolio positions, and the diff.
 * Auth via user session. REMOVE after debugging.
 *
 * Usage: GET /api/debug/akahu-diff?portfolioId=<uuid>
 */
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const portfolioId = url.searchParams.get("portfolioId")
  if (!portfolioId) {
    // Auto-pick first portfolio
    const { data: ps } = await supabase
      .from("portfolios").select("id").eq("user_id", user.id).order("created_at").limit(1)
    if (!ps?.[0]) return NextResponse.json({ error: "No portfolio. Pass ?portfolioId=" }, { status: 400 })
    return NextResponse.redirect(new URL(`/api/debug/akahu-diff?portfolioId=${ps[0].id}`, url.origin))
  }

  // 1. Current Akahu holdings
  const { data: conn } = await supabase
    .from("broker_connections").select("access_token, account_id, last_sync_at")
    .eq("user_id", user.id).eq("broker", "akahu").limit(1).single()
  if (!conn?.access_token) return NextResponse.json({ error: "No Akahu connection" }, { status: 404 })

  let akahuHoldings: Array<{ symbol: string; name: string; quantity: number; pricePerUnit: number; accountId: string }> = []
  let akahuError: string | null = null
  try {
    const { holdings } = await fetchInvestmentAccounts(conn.access_token, conn.account_id ?? undefined)
    const resolved = await resolveTickersBatch(holdings.map((h) => ({ name: h.name, ticker: h.ticker, code: h.code, symbol: h.symbol })))
    akahuHoldings = holdings.map((h) => ({
      symbol: resolved.get(h.name)?.symbol ?? h.symbol ?? h.name,
      name: h.name,
      quantity: h.quantity,
      pricePerUnit: h.pricePerUnit,
      accountId: h.accountId,
    }))
  } catch (err) {
    akahuError = err instanceof Error ? err.message : String(err)
  }

  // 2. DB positions
  const { data: dbPositions } = await supabase
    .from("portfolio_positions")
    .select("symbol, quantity, average_cost, asset_type, opened_at, closed_at, updated_at")
    .eq("portfolio_id", portfolioId)
    .is("closed_at", null)

  const dbBySymbol = new Map<string, { quantity: number; average_cost: number; updated_at: string }>()
  for (const p of dbPositions ?? []) {
    if (p.asset_type === "cash") continue
    dbBySymbol.set(p.symbol, {
      quantity: parseFloat(p.quantity),
      average_cost: parseFloat(p.average_cost),
      updated_at: p.updated_at,
    })
  }

  const akahuBySymbol = new Map<string, { quantity: number; pricePerUnit: number }>()
  for (const h of akahuHoldings) {
    const cur = akahuBySymbol.get(h.symbol)
    akahuBySymbol.set(h.symbol, {
      quantity: (cur?.quantity ?? 0) + h.quantity,
      pricePerUnit: h.pricePerUnit,
    })
  }

  // 3. Diff
  const diff: Array<{ symbol: string; status: string; akahu?: { quantity: number; pricePerUnit: number }; db?: { quantity: number; average_cost: number; updated_at: string } }> = []

  for (const [symbol, akahu] of akahuBySymbol) {
    const db = dbBySymbol.get(symbol)
    if (!db) {
      diff.push({ symbol, status: "in_akahu_but_not_db (needs sync)", akahu })
    } else if (Math.abs(db.quantity - akahu.quantity) > 0.0001) {
      diff.push({ symbol, status: "quantity_mismatch", akahu, db })
    } else {
      diff.push({ symbol, status: "ok", akahu, db })
    }
  }
  for (const [symbol, db] of dbBySymbol) {
    if (!akahuBySymbol.has(symbol)) {
      diff.push({ symbol, status: "in_db_but_not_akahu (likely sold but not closed)", db })
    }
  }

  return NextResponse.json({
    portfolioId,
    lastSyncAt: conn.last_sync_at,
    akahuError,
    summary: {
      akahuHoldingsCount: akahuBySymbol.size,
      dbPositionsCount: dbBySymbol.size,
      mismatches: diff.filter((d) => d.status !== "ok").length,
    },
    diff: diff.sort((a, b) => a.status.localeCompare(b.status)),
  })
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchFlexPositions, normalizePositions } from "@/lib/brokers/ibkr-flex"

export const maxDuration = 60

/**
 * Diagnostic: shows IBKR Flex response + DB positions side-by-side.
 * Usage: /api/debug/ibkr-trace?portfolioId=<uuid>
 */
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const portfolioId = url.searchParams.get("portfolioId")

  const { data: conn } = await supabase
    .from("broker_connections")
    .select("access_token, account_id, last_sync_at")
    .eq("user_id", user.id).eq("broker", "ibkr").limit(1).single()
  if (!conn?.access_token || !conn?.account_id) {
    return NextResponse.json({ error: "No IBKR connection" }, { status: 404 })
  }

  // 1. Fetch raw + parsed from Flex
  let flex
  try {
    flex = await fetchFlexPositions(conn.access_token, conn.account_id)
  } catch (err) {
    return NextResponse.json({ error: `Flex fetch failed: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }

  const normalized = normalizePositions(flex.positions)

  // 2. Compare against DB if portfolioId provided
  let dbPositions: Array<{ symbol: string; quantity: string; average_cost: string; source: string }> | null = null
  if (portfolioId) {
    const { data } = await supabase
      .from("portfolio_positions")
      .select("symbol, quantity, average_cost, source")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", user.id)
      .is("closed_at", null)
    dbPositions = data ?? []
  }

  // 3. Show a sample of the raw XML (positions section) so we can see exactly what IBKR sent
  const xmlSnippet = flex.rawXml.match(/<OpenPosition\b[^/]*\/?>/g)?.slice(0, 3) ?? []

  return NextResponse.json({
    queryName: flex.queryName,
    fromDate: flex.fromDate,
    toDate: flex.toDate,
    summary: {
      flexPositionsCount: flex.positions.length,
      normalizedCount: normalized.length,
      accountIds: flex.accountIds,
    },
    sampleRawXml: xmlSnippet,
    flexPositions: flex.positions.map((p) => ({
      symbol: p.symbol,
      description: p.description,
      conid: p.conid,
      assetCategory: p.assetCategory,
      currency: p.currency,
      position: p.position,
      markPrice: p.markPrice,
      costBasisPrice: p.costBasisPrice,
      costBasisMoney: p.costBasisMoney,
    })),
    normalizedPositions: normalized,
    dbPositions,
  })
}

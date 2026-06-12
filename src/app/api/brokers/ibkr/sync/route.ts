import { NextRequest, NextResponse } from "next/server"
import { fetchFlexPositions, normalizePositions } from "@/lib/brokers/ibkr-flex"
import { createClient, getServerUserId } from "@/lib/supabase/server"
import { nudgeNewPosition } from "@/lib/digest/nudge"

export const maxDuration = 60

/**
 * POST /api/brokers/ibkr/sync { portfolioId }
 *
 * Pulls current holdings from IBKR via the Flex Web Service, upserts positions,
 * records a transaction per new position, and auto-closes positions that IBKR
 * no longer reports (source="ibkr" check protects manual/akahu positions).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId } = await request.json()
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  // Load IBKR connection (stored under broker_connections; access_token = Flex token, account_id = queryId)
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "ibkr")
    .limit(1)
    .single()

  if (!connection?.access_token || !connection?.account_id) {
    return NextResponse.json(
      { error: "No IBKR Flex connection. Open broker settings → connect IBKR with Flex token + query ID." },
      { status: 404 },
    )
  }

  try {
    // 1. Fetch from Flex Web Service (2-step + auto-retry for "still generating")
    const flex = await fetchFlexPositions(connection.access_token, connection.account_id)
    const positions = normalizePositions(flex.positions)

    // 2. Upsert each position
    let imported = 0
    let updated = 0
    const currentSymbols = new Set(positions.map((p) => p.symbol))

    for (const pos of positions) {
      const brokerRef = pos.brokerRef

      // Dedup transaction by broker_ref (conid+account combo)
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("broker_ref", brokerRef)
        .limit(1)
        .single()

      // Position upsert (one position per symbol — overwrites quantity from Flex's current state)
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity, average_cost")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", pos.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      // Last-known price from Flex (positionValue / quantity) — used as a fallback
      // when Yahoo can't quote the symbol (options, foreign stocks).
      const rawFlex = flex.positions.find((f) => f.symbol === pos.symbol)
      const lastPrice = rawFlex && rawFlex.position !== 0
        ? Math.abs(rawFlex.positionValue) / Math.abs(rawFlex.position)
        : null

      if (existingPos) {
        await supabase
          .from("portfolio_positions")
          .update({
            quantity: pos.quantity.toString(),
            average_cost: pos.averageCost.toString(),
            source: "ibkr",
            currency: pos.currency,
            last_price: lastPrice,
            last_price_at: new Date().toISOString(),
          })
          .eq("id", existingPos.id)
        updated++
      } else {
        await supabase.from("portfolio_positions").insert({
          portfolio_id: portfolioId,
          user_id: userId,
          symbol: pos.symbol,
          quantity: pos.quantity.toString(),
          average_cost: pos.averageCost.toString(),
          asset_type: pos.assetType,
          source: "ibkr",
          currency: pos.currency,
          last_price: lastPrice,
          last_price_at: new Date().toISOString(),
        })
        nudgeNewPosition(userId, pos.symbol, supabase)
        imported++
      }

      // Audit trail: insert transaction if we haven't seen this broker_ref
      if (!existingTx) {
        await supabase.from("transactions").insert({
          portfolio_id: portfolioId,
          user_id: userId,
          symbol: pos.symbol,
          action: "buy",
          quantity: pos.quantity.toString(),
          price: pos.averageCost.toString(),
          broker_ref: brokerRef,
        })
      }
    }

    // 3. Close source=ibkr positions IBKR no longer reports (user sold)
    const { data: openIbkrPositions } = await supabase
      .from("portfolio_positions")
      .select("id, symbol")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .eq("source", "ibkr")
      .is("closed_at", null)

    let closed = 0
    for (const p of openIbkrPositions ?? []) {
      if (currentSymbols.has(p.symbol)) continue
      await supabase
        .from("portfolio_positions")
        .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", p.id)
      closed++
    }

    // 4. Update last sync timestamp
    await supabase
      .from("broker_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id)

    return NextResponse.json({
      imported,
      updated,
      closed,
      total: positions.length,
      accountIds: flex.accountIds,
      queryName: flex.queryName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("IBKR Flex sync error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

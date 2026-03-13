import { NextRequest, NextResponse } from "next/server"
import { fetchPositions, refreshAccessToken } from "@/lib/brokers/ibkr"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId } = await request.json()
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  // Get broker connection
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "ibkr")
    .limit(1)
    .single()

  if (!connection) {
    return NextResponse.json({ error: "No IBKR connection found. Please connect first." }, { status: 404 })
  }

  let accessToken = connection.access_token

  // Refresh token if expired
  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    try {
      const tokens = await refreshAccessToken(connection.refresh_token)
      accessToken = tokens.accessToken
      await supabase
        .from("broker_connections")
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        })
        .eq("id", connection.id)
    } catch {
      return NextResponse.json({ error: "Token refresh failed. Please reconnect IBKR." }, { status: 401 })
    }
  }

  try {
    const positions = await fetchPositions(accessToken, connection.account_id)

    let imported = 0
    let skipped = 0

    for (const pos of positions) {
      // Check if position already exists via brokerRef in transactions
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("broker_ref", pos.brokerRef)
        .limit(1)
        .single()

      if (existingTx) {
        skipped++
        continue
      }

      // Upsert position
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity, average_cost")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", pos.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      if (existingPos) {
        const oldQty = parseFloat(existingPos.quantity)
        const oldCost = parseFloat(existingPos.average_cost)
        const newQty = oldQty + pos.quantity
        const newAvgCost = (oldQty * oldCost + pos.quantity * pos.averageCost) / newQty

        await supabase
          .from("portfolio_positions")
          .update({
            quantity: newQty.toString(),
            average_cost: newAvgCost.toString(),
          })
          .eq("id", existingPos.id)
      } else {
        await supabase.from("portfolio_positions").insert({
          portfolio_id: portfolioId,
          user_id: userId,
          symbol: pos.symbol,
          quantity: pos.quantity.toString(),
          average_cost: pos.averageCost.toString(),
          asset_type: pos.assetType,
        })
      }

      // Record transaction for audit trail
      await supabase.from("transactions").insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol: pos.symbol,
        action: "buy",
        quantity: pos.quantity.toString(),
        price: pos.averageCost.toString(),
        broker_ref: pos.brokerRef,
      })

      imported++
    }

    // Update last sync time
    await supabase
      .from("broker_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id)

    return NextResponse.json({ imported, skipped, total: positions.length })
  } catch (error) {
    console.error("IBKR sync error:", error)
    return NextResponse.json({ error: "Failed to sync positions" }, { status: 500 })
  }
}

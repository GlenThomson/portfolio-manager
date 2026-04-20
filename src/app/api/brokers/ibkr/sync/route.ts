import { NextRequest, NextResponse } from "next/server"
import { fetchIBRITPositions } from "@/lib/brokers/ibkr"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId } = await request.json()
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  // Get broker connection with stored IBRIT credentials
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "ibkr")
    .limit(1)
    .single()

  if (!connection) {
    return NextResponse.json(
      { error: "No IBKR connection found. Please connect first." },
      { status: 404 }
    )
  }

  // IBRIT credentials stored in access_token (token) and refresh_token (queryId) fields
  const token = connection.access_token
  const queryId = connection.refresh_token

  if (!token || !queryId) {
    return NextResponse.json(
      { error: "IBKR credentials missing. Please reconnect." },
      { status: 400 }
    )
  }

  try {
    const positions = await fetchIBRITPositions({ token, queryId })

    let imported = 0
    let skipped = 0
    let updated = 0

    for (const pos of positions) {
      // Check if position already exists
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity, average_cost")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", pos.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      if (existingPos) {
        // Update existing position with latest data from IBKR
        const currentQty = parseFloat(existingPos.quantity)
        if (Math.abs(currentQty - pos.quantity) < 0.0001 &&
            Math.abs(parseFloat(existingPos.average_cost) - pos.averageCost) < 0.01) {
          skipped++
          continue
        }

        await supabase
          .from("portfolio_positions")
          .update({
            quantity: pos.quantity.toString(),
            average_cost: pos.averageCost.toString(),
            asset_type: pos.assetType,
          })
          .eq("id", existingPos.id)

        updated++
      } else {
        // Create new position
        await supabase.from("portfolio_positions").insert({
          portfolio_id: portfolioId,
          user_id: userId,
          symbol: pos.symbol,
          quantity: pos.quantity.toString(),
          average_cost: pos.averageCost.toString(),
          asset_type: pos.assetType,
        })

        // Record initial transaction for audit trail
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
    }

    // Close positions that are in our DB but no longer in IBKR
    const { data: dbPositions } = await supabase
      .from("portfolio_positions")
      .select("id, symbol, broker_ref")
      .eq("portfolio_id", portfolioId)
      .is("closed_at", null)

    if (dbPositions) {
      const ibkrSymbols = new Set(positions.map((p) => p.symbol))
      for (const dbPos of dbPositions) {
        // Only close positions that came from IBKR (have ibrit- broker ref in transactions)
        if (!ibkrSymbols.has(dbPos.symbol)) {
          const { data: ibkrTx } = await supabase
            .from("transactions")
            .select("id")
            .eq("portfolio_id", portfolioId)
            .eq("symbol", dbPos.symbol)
            .like("broker_ref", "ibrit-%")
            .limit(1)
            .single()

          if (ibkrTx) {
            await supabase
              .from("portfolio_positions")
              .update({ closed_at: new Date().toISOString() })
              .eq("id", dbPos.id)
          }
        }
      }
    }

    // Update last sync time
    await supabase
      .from("broker_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", connection.id)

    return NextResponse.json({
      imported,
      updated,
      skipped,
      total: positions.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync positions"
    console.error("IBKR sync error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

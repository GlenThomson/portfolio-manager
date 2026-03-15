import { NextRequest, NextResponse } from "next/server"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/**
 * POST /api/brokers/fix-costs
 * Recalculates average costs for positions where average_cost is 0.
 * Uses transaction data (totalCost / quantity) to compute the correct average cost.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId } = await request.json()

  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  // Find all open stock positions with zero average cost
  const { data: positions, error: posError } = await supabase
    .from("portfolio_positions")
    .select("id, symbol, quantity")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .eq("asset_type", "stock")
    .eq("average_cost", "0")
    .is("closed_at", null)

  if (posError) {
    return NextResponse.json({ error: posError.message }, { status: 500 })
  }

  if (!positions || positions.length === 0) {
    return NextResponse.json({ fixed: 0, message: "No zero-cost positions found" })
  }

  let fixed = 0

  for (const pos of positions) {
    // Get all buy transactions for this symbol in this portfolio
    const { data: transactions } = await supabase
      .from("transactions")
      .select("quantity, price, action")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .eq("symbol", pos.symbol)
      .eq("action", "buy")

    if (!transactions || transactions.length === 0) continue

    // Calculate weighted average cost from all buy transactions
    let totalCost = 0
    let totalQty = 0
    for (const tx of transactions) {
      const qty = parseFloat(tx.quantity)
      const price = parseFloat(tx.price)
      if (qty > 0 && price > 0) {
        totalCost += qty * price
        totalQty += qty
      }
    }

    if (totalQty > 0 && totalCost > 0) {
      const avgCost = totalCost / totalQty

      const { error: updateError } = await supabase
        .from("portfolio_positions")
        .update({ average_cost: avgCost.toString() })
        .eq("id", pos.id)

      if (!updateError) {
        fixed++
      }
    }
  }

  return NextResponse.json({ fixed, total: positions.length })
}

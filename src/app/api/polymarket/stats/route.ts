import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface BetRow {
  id: string
  market_id: string
  question: string | null
  category: string | null
  side: string
  shares: string
  avg_price_usd: string
  current_price_usd: string | null
  exit_price: string | null
  exited_at: string | null
  pnl_usd: string | null
  resolved: boolean
  resolution_outcome: string | null
  entered_at: string
}

interface CategoryStats {
  category: string
  betCount: number
  wins: number
  losses: number
  winRate: number      // 0-1
  totalPnl: number
  totalStaked: number
  roi: number          // pnl/staked
}

/**
 * GET /api/polymarket/stats
 * Returns aggregate stats over the user's bets — overall + by category.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: bets } = await supabase
    .from("polymarket_user_bets")
    .select("*")
    .eq("user_id", user.id)

  const all = (bets ?? []) as BetRow[]
  const open = all.filter((b) => !b.exited_at)
  const closed = all.filter((b) => b.exited_at)

  // Open positions: sum unrealized PnL from current_price_usd
  let openValue = 0
  let openCost = 0
  let openPnl = 0
  for (const b of open) {
    const shares = Number(b.shares)
    const cost = Number(b.avg_price_usd) * shares
    const value = (Number(b.current_price_usd ?? b.avg_price_usd) || Number(b.avg_price_usd)) * shares
    openCost += cost
    openValue += value
    openPnl += value - cost
  }

  // Closed: realized PnL
  let realizedPnl = 0
  let realizedStaked = 0
  let wins = 0
  let losses = 0
  for (const b of closed) {
    const pnl = b.pnl_usd != null
      ? Number(b.pnl_usd)
      : (Number(b.exit_price ?? b.current_price_usd ?? 0) - Number(b.avg_price_usd)) * Number(b.shares)
    const staked = Number(b.avg_price_usd) * Number(b.shares)
    realizedPnl += pnl
    realizedStaked += staked
    if (pnl > 0) wins++
    else if (pnl < 0) losses++
  }

  const winRate = (wins + losses) > 0 ? wins / (wins + losses) : 0
  const realizedRoi = realizedStaked > 0 ? realizedPnl / realizedStaked : 0

  // By category
  const byCategoryMap = new Map<string, CategoryStats>()
  for (const b of all) {
    const cat = b.category ?? "Uncategorised"
    if (!byCategoryMap.has(cat)) {
      byCategoryMap.set(cat, {
        category: cat,
        betCount: 0, wins: 0, losses: 0, winRate: 0,
        totalPnl: 0, totalStaked: 0, roi: 0,
      })
    }
    const stats = byCategoryMap.get(cat)!
    stats.betCount++
    const staked = Number(b.avg_price_usd) * Number(b.shares)
    stats.totalStaked += staked

    if (b.exited_at) {
      const pnl = b.pnl_usd != null
        ? Number(b.pnl_usd)
        : (Number(b.exit_price ?? b.current_price_usd ?? 0) - Number(b.avg_price_usd)) * Number(b.shares)
      stats.totalPnl += pnl
      if (pnl > 0) stats.wins++
      else if (pnl < 0) stats.losses++
    } else {
      const value = (Number(b.current_price_usd ?? b.avg_price_usd) || Number(b.avg_price_usd)) * Number(b.shares)
      stats.totalPnl += value - staked
    }
  }
  for (const stats of byCategoryMap.values()) {
    const decided = stats.wins + stats.losses
    stats.winRate = decided > 0 ? stats.wins / decided : 0
    stats.roi = stats.totalStaked > 0 ? stats.totalPnl / stats.totalStaked : 0
  }

  return NextResponse.json({
    overall: {
      totalBets: all.length,
      openBets: open.length,
      closedBets: closed.length,
      wins,
      losses,
      winRate,
      openValue,
      openCost,
      openPnl,
      realizedPnl,
      realizedStaked,
      realizedRoi,
      totalPnl: openPnl + realizedPnl,
    },
    byCategory: Array.from(byCategoryMap.values()).sort((a, b) => b.totalStaked - a.totalStaked),
  })
}

/**
 * Half-Kelly position sizing.
 *
 * Full Kelly: f = (p × b - q) / b
 * where p = win probability, b = win/loss ratio, q = 1 - p
 *
 * Half-Kelly (f/2) is the practical standard because:
 * - Full Kelly assumes perfect knowledge of edge and is extremely volatile
 * - Half-Kelly captures ~75% of the growth rate with ~50% of the drawdown
 * - Most professional quant funds use 1/4 to 1/2 Kelly
 *
 * Inputs can come from historical returns or analyst estimates.
 */

import { getChart } from "@/lib/market/yahoo"

export interface KellyInput {
  symbol: string
  // Either provide historical lookback or manual estimates
  winRate?: number // 0-1, probability of positive return period
  avgWin?: number // average winning return (positive decimal, e.g., 0.05 = 5%)
  avgLoss?: number // average losing return (positive decimal, e.g., 0.03 = 3%)
  // Optional constraints
  maxPosition?: number // maximum allocation (default 0.25 = 25%)
  accountSize?: number // total portfolio value (for dollar amounts)
}

export interface KellyResult {
  symbol: string
  fullKelly: number // full Kelly fraction (0-1)
  halfKelly: number // recommended half-Kelly fraction
  quarterKelly: number // conservative quarter-Kelly fraction
  maxPosition: number // capped position size
  suggestedAllocation: number // final suggestion (half-Kelly, capped)
  // Inputs used
  winRate: number
  avgWin: number
  avgLoss: number
  winLossRatio: number
  edge: number // expected value per trade
  // Dollar amounts (if accountSize provided)
  dollarAllocation?: number
  // Interpretation
  interpretation: string
  riskLevel: "conservative" | "moderate" | "aggressive" | "no_edge"
}

/**
 * Compute Kelly fraction from win rate and win/loss ratio.
 */
function kellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss <= 0 || avgWin <= 0 || winRate <= 0 || winRate >= 1) return 0

  const b = avgWin / avgLoss // win/loss ratio
  const q = 1 - winRate

  // Kelly: (p * b - q) / b
  const f = (winRate * b - q) / b

  return Math.max(0, f)
}

/**
 * Compute win rate and avg win/loss from historical daily returns.
 */
function analyzeReturns(closes: number[]): {
  winRate: number
  avgWin: number
  avgLoss: number
  monthlyWinRate: number
  monthlyAvgWin: number
  monthlyAvgLoss: number
} {
  if (closes.length < 22) {
    return { winRate: 0, avgWin: 0, avgLoss: 0, monthlyWinRate: 0, monthlyAvgWin: 0, monthlyAvgLoss: 0 }
  }

  // Monthly returns (approximately 21 trading days)
  const monthlyReturns: number[] = []
  for (let i = 21; i < closes.length; i += 21) {
    const ret = (closes[i] - closes[i - 21]) / closes[i - 21]
    monthlyReturns.push(ret)
  }

  const wins = monthlyReturns.filter(r => r > 0)
  const losses = monthlyReturns.filter(r => r < 0)

  const monthlyWinRate = monthlyReturns.length > 0 ? wins.length / monthlyReturns.length : 0
  const monthlyAvgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0
  const monthlyAvgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0

  // Daily returns for additional stats
  const dailyReturns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }

  const dailyWins = dailyReturns.filter(r => r > 0)
  const dailyLosses = dailyReturns.filter(r => r < 0)

  return {
    winRate: dailyReturns.length > 0 ? dailyWins.length / dailyReturns.length : 0,
    avgWin: dailyWins.length > 0 ? dailyWins.reduce((s, v) => s + v, 0) / dailyWins.length : 0,
    avgLoss: dailyLosses.length > 0 ? Math.abs(dailyLosses.reduce((s, v) => s + v, 0) / dailyLosses.length) : 0,
    monthlyWinRate,
    monthlyAvgWin,
    monthlyAvgLoss,
  }
}

/**
 * Compute Half-Kelly position size for a symbol.
 * If winRate/avgWin/avgLoss are not provided, fetches 2 years of historical data.
 */
export async function computeKellySize(input: KellyInput): Promise<KellyResult> {
  const maxPos = input.maxPosition ?? 0.25

  let winRate = input.winRate ?? 0
  let avgWin = input.avgWin ?? 0
  let avgLoss = input.avgLoss ?? 0

  // If no manual inputs, compute from historical data
  if (!input.winRate || !input.avgWin || !input.avgLoss) {
    const now = new Date()
    const twoYearsAgo = new Date(now)
    twoYearsAgo.setDate(twoYearsAgo.getDate() - 730)
    const period1 = twoYearsAgo.toISOString().split("T")[0]

    const candles = await getChart(input.symbol, period1, "1d")
    const closes = (candles ?? [])
      .filter((c: { close: number }) => c.close > 0)
      .map((c: { close: number }) => c.close)

    if (closes.length < 30) {
      return {
        symbol: input.symbol,
        fullKelly: 0,
        halfKelly: 0,
        quarterKelly: 0,
        maxPosition: maxPos,
        suggestedAllocation: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        winLossRatio: 0,
        edge: 0,
        interpretation: "Insufficient historical data to compute position size",
        riskLevel: "no_edge",
      }
    }

    // Use monthly returns for Kelly (more stable than daily)
    const stats = analyzeReturns(closes)
    winRate = stats.monthlyWinRate
    avgWin = stats.monthlyAvgWin
    avgLoss = stats.monthlyAvgLoss
  }

  const full = kellyFraction(winRate, avgWin, avgLoss)
  const half = full / 2
  const quarter = full / 4
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0
  const edge = winRate * avgWin - (1 - winRate) * avgLoss

  const suggested = Math.min(half, maxPos)

  let interpretation: string
  let riskLevel: KellyResult["riskLevel"]

  if (full <= 0) {
    interpretation = `No positive edge detected (win rate ${(winRate * 100).toFixed(1)}%, W/L ratio ${winLossRatio.toFixed(2)}). Kelly suggests no position.`
    riskLevel = "no_edge"
  } else if (half <= 0.05) {
    interpretation = `Small edge detected. Half-Kelly suggests ${(half * 100).toFixed(1)}% allocation — conservative position appropriate.`
    riskLevel = "conservative"
  } else if (half <= 0.15) {
    interpretation = `Moderate edge detected. Half-Kelly suggests ${(half * 100).toFixed(1)}% allocation — reasonable position size.`
    riskLevel = "moderate"
  } else {
    interpretation = `Strong edge detected. Half-Kelly suggests ${(half * 100).toFixed(1)}% allocation (capped at ${(maxPos * 100).toFixed(0)}%). Full Kelly of ${(full * 100).toFixed(1)}% is too aggressive for most investors.`
    riskLevel = "aggressive"
  }

  const result: KellyResult = {
    symbol: input.symbol,
    fullKelly: Math.round(full * 10000) / 10000,
    halfKelly: Math.round(half * 10000) / 10000,
    quarterKelly: Math.round(quarter * 10000) / 10000,
    maxPosition: maxPos,
    suggestedAllocation: Math.round(suggested * 10000) / 10000,
    winRate: Math.round(winRate * 10000) / 10000,
    avgWin: Math.round(avgWin * 10000) / 10000,
    avgLoss: Math.round(avgLoss * 10000) / 10000,
    winLossRatio: Math.round(winLossRatio * 100) / 100,
    edge: Math.round(edge * 10000) / 10000,
    interpretation,
    riskLevel,
  }

  if (input.accountSize && input.accountSize > 0) {
    result.dollarAllocation = Math.round(suggested * input.accountSize * 100) / 100
  }

  return result
}

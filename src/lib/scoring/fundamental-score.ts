/**
 * Fundamental score (0-100) based on valuation, profitability, and growth metrics.
 */

export interface FundamentalInput {
  forwardPE: number | null
  revenueGrowth: number | null // as decimal (0.15 = 15%)
  profitMargin: number | null // as decimal
  returnOnEquity: number | null // as decimal
  epsGrowth: number | null // as decimal
  recommendationKey: string | null // "buy", "hold", "sell", etc.
}

export interface FundamentalScoreResult {
  score: number
  details: Record<string, string>
}

function scoreMetric(
  value: number | null,
  thresholds: { excellent: number; good: number; fair: number },
  higherIsBetter: boolean
): { points: number; tier: string } {
  if (value == null || isNaN(value)) return { points: 0, tier: "unavailable" }

  if (higherIsBetter) {
    if (value >= thresholds.excellent) return { points: 20, tier: "excellent" }
    if (value >= thresholds.good) return { points: 14, tier: "good" }
    if (value >= thresholds.fair) return { points: 8, tier: "fair" }
    return { points: 2, tier: "poor" }
  } else {
    // Lower is better (e.g., P/E)
    if (value <= thresholds.excellent) return { points: 20, tier: "excellent" }
    if (value <= thresholds.good) return { points: 14, tier: "good" }
    if (value <= thresholds.fair) return { points: 8, tier: "fair" }
    return { points: 2, tier: "poor" }
  }
}

export function computeFundamentalScore(input: FundamentalInput): FundamentalScoreResult {
  const details: Record<string, string> = {}
  let totalPoints = 0
  let metricCount = 0

  // Forward P/E: lower is better
  if (input.forwardPE != null && !isNaN(input.forwardPE) && input.forwardPE > 0) {
    const { points, tier } = scoreMetric(input.forwardPE, { excellent: 15, good: 25, fair: 40 }, false)
    totalPoints += points
    metricCount++
    details.forwardPE = `Forward P/E ${input.forwardPE.toFixed(1)} — ${tier}`
  } else {
    details.forwardPE = "Forward P/E unavailable"
  }

  // Revenue growth: higher is better
  if (input.revenueGrowth != null && !isNaN(input.revenueGrowth)) {
    const pct = input.revenueGrowth * 100
    const { points, tier } = scoreMetric(pct, { excellent: 20, good: 10, fair: 0 }, true)
    totalPoints += points
    metricCount++
    details.revenueGrowth = `Revenue growth ${pct.toFixed(1)}% — ${tier}`
  } else {
    details.revenueGrowth = "Revenue growth unavailable"
  }

  // Profit margin: higher is better
  if (input.profitMargin != null && !isNaN(input.profitMargin)) {
    const pct = input.profitMargin * 100
    const { points, tier } = scoreMetric(pct, { excellent: 20, good: 10, fair: 5 }, true)
    totalPoints += points
    metricCount++
    details.profitMargin = `Profit margin ${pct.toFixed(1)}% — ${tier}`
  } else {
    details.profitMargin = "Profit margin unavailable"
  }

  // ROE: higher is better
  if (input.returnOnEquity != null && !isNaN(input.returnOnEquity)) {
    const pct = input.returnOnEquity * 100
    const { points, tier } = scoreMetric(pct, { excellent: 20, good: 15, fair: 8 }, true)
    totalPoints += points
    metricCount++
    details.returnOnEquity = `ROE ${pct.toFixed(1)}% — ${tier}`
  } else {
    details.returnOnEquity = "ROE unavailable"
  }

  // EPS growth: higher is better
  if (input.epsGrowth != null && !isNaN(input.epsGrowth)) {
    const pct = input.epsGrowth * 100
    const { points, tier } = scoreMetric(pct, { excellent: 25, good: 10, fair: 0 }, true)
    totalPoints += points
    metricCount++
    details.epsGrowth = `EPS growth ${pct.toFixed(1)}% — ${tier}`
  } else {
    details.epsGrowth = "EPS growth unavailable"
  }

  // Analyst recommendation bonus
  if (input.recommendationKey) {
    const key = input.recommendationKey.toLowerCase()
    if (key === "strong_buy" || key === "strongbuy") {
      totalPoints += 5
      details.recommendation = "Analyst consensus: Strong Buy"
    } else if (key === "buy") {
      totalPoints += 3
      details.recommendation = "Analyst consensus: Buy"
    } else if (key === "hold") {
      details.recommendation = "Analyst consensus: Hold"
    } else if (key === "sell" || key === "underperform") {
      totalPoints -= 3
      details.recommendation = `Analyst consensus: ${input.recommendationKey}`
    } else if (key === "strong_sell" || key === "strongsell") {
      totalPoints -= 5
      details.recommendation = "Analyst consensus: Strong Sell"
    } else {
      details.recommendation = `Analyst consensus: ${input.recommendationKey}`
    }
  }

  // Normalize: each metric scores 0-20, max possible is metricCount * 20
  // Scale to 0-100
  let score: number
  if (metricCount > 0) {
    score = Math.round((totalPoints / (metricCount * 20)) * 100)
  } else {
    score = 50 // default neutral if no data
  }

  score = Math.max(0, Math.min(100, score))

  return { score, details }
}

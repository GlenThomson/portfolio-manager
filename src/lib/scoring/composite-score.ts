/**
 * Composite score — combines technical, fundamental, sentiment, and momentum
 * with configurable weights. Converts to letter grade.
 */

export interface StockScore {
  symbol: string
  overall: number
  grade: string
  technical: number
  fundamental: number
  sentiment: number
  momentum: number
  details: Record<string, string>
}

const WEIGHTS = {
  technical: 0.30,
  fundamental: 0.35,
  sentiment: 0.20,
  momentum: 0.15,
}

/**
 * Compute momentum score (0-100) from 3-month and 6-month price returns.
 */
export function computeMomentumScore(
  currentPrice: number,
  price3mAgo: number | null,
  price6mAgo: number | null,
): { score: number; details: Record<string, string> } {
  const details: Record<string, string> = {}
  let score = 50

  if (price3mAgo != null && price3mAgo > 0) {
    const ret3m = ((currentPrice - price3mAgo) / price3mAgo) * 100
    if (ret3m > 20) {
      score += 20
      details.return3m = `3-month return +${ret3m.toFixed(1)}% — strong upward momentum`
    } else if (ret3m > 10) {
      score += 12
      details.return3m = `3-month return +${ret3m.toFixed(1)}% — good momentum`
    } else if (ret3m > 0) {
      score += 5
      details.return3m = `3-month return +${ret3m.toFixed(1)}% — mild positive momentum`
    } else if (ret3m > -10) {
      score -= 5
      details.return3m = `3-month return ${ret3m.toFixed(1)}% — mild negative momentum`
    } else if (ret3m > -20) {
      score -= 12
      details.return3m = `3-month return ${ret3m.toFixed(1)}% — poor momentum`
    } else {
      score -= 20
      details.return3m = `3-month return ${ret3m.toFixed(1)}% — severe downward momentum`
    }
  } else {
    details.return3m = "3-month data unavailable"
  }

  if (price6mAgo != null && price6mAgo > 0) {
    const ret6m = ((currentPrice - price6mAgo) / price6mAgo) * 100
    if (ret6m > 30) {
      score += 15
      details.return6m = `6-month return +${ret6m.toFixed(1)}% — strong trend`
    } else if (ret6m > 10) {
      score += 8
      details.return6m = `6-month return +${ret6m.toFixed(1)}% — positive trend`
    } else if (ret6m > 0) {
      score += 3
      details.return6m = `6-month return +${ret6m.toFixed(1)}% — mild uptrend`
    } else if (ret6m > -15) {
      score -= 5
      details.return6m = `6-month return ${ret6m.toFixed(1)}% — mild downtrend`
    } else {
      score -= 15
      details.return6m = `6-month return ${ret6m.toFixed(1)}% — strong downtrend`
    }
  } else {
    details.return6m = "6-month data unavailable"
  }

  score = Math.max(0, Math.min(100, score))
  return { score, details }
}

export function toLetterGrade(score: number): string {
  if (score >= 90) return "A+"
  if (score >= 80) return "A"
  if (score >= 75) return "B+"
  if (score >= 65) return "B"
  if (score >= 50) return "C"
  if (score >= 35) return "D"
  return "F"
}

export function computeCompositeScore(
  technicalScore: number,
  fundamentalScore: number,
  sentimentScore: number,
  momentumScore: number,
  allDetails: Record<string, string>,
  symbol: string,
): StockScore {
  const overall = Math.round(
    technicalScore * WEIGHTS.technical +
    fundamentalScore * WEIGHTS.fundamental +
    sentimentScore * WEIGHTS.sentiment +
    momentumScore * WEIGHTS.momentum
  )

  const clampedOverall = Math.max(0, Math.min(100, overall))

  return {
    symbol,
    overall: clampedOverall,
    grade: toLetterGrade(clampedOverall),
    technical: technicalScore,
    fundamental: fundamentalScore,
    sentiment: sentimentScore,
    momentum: momentumScore,
    details: allDetails,
  }
}

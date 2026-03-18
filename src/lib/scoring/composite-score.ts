/**
 * Composite score — combines technical, fundamental, sentiment, momentum,
 * and risk with research-backed weights. Converts to letter grade.
 *
 * Weight rationale (academic research):
 *   Momentum + EPS: 30% — strongest predictor (Morningstar, Mill Street)
 *   Fundamental:     30% — longest half-life at 25.3 months
 *   Technical:       20% — RSI + Bollinger best win rate
 *   Sentiment:       10% — analyst dispersion > consensus
 *   Risk:            10% — beta, volatility, drawdown
 */

export type SignalFreshness = "fresh" | "aging" | "stale"

export interface StockScore {
  symbol: string
  overall: number
  grade: string
  technical: number
  fundamental: number
  sentiment: number
  momentum: number
  risk: number
  keyDrivers: string[]
  signalFreshness: Record<string, SignalFreshness>
  details: Record<string, string>
}

const WEIGHTS = {
  momentum: 0.30,
  fundamental: 0.30,
  technical: 0.20,
  sentiment: 0.10,
  risk: 0.10,
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

/**
 * Extract top 3 key drivers — the factors with the largest deviation from neutral (50).
 */
function extractKeyDrivers(
  scores: { label: string; score: number; prefix: string }[],
  allDetails: Record<string, string>,
): string[] {
  // Sort by absolute deviation from 50 (neutral)
  const sorted = [...scores].sort(
    (a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)
  )

  const drivers: string[] = []

  for (const factor of sorted) {
    if (drivers.length >= 3) break

    const direction = factor.score >= 50 ? "positive" : "negative"

    // Find the most impactful detail for this factor
    const relevantDetails = Object.entries(allDetails)
      .filter(([k]) => k.startsWith(factor.prefix))
      .map(([, v]) => v)
      .filter(Boolean)

    if (relevantDetails.length > 0) {
      // Pick the first detail (most important one)
      drivers.push(`${factor.label} (${direction}): ${relevantDetails[0]}`)
    } else if (Math.abs(factor.score - 50) >= 10) {
      drivers.push(`${factor.label}: ${direction} signal (score ${factor.score})`)
    }
  }

  return drivers
}

export interface CompositeInput {
  technicalScore: number
  fundamentalScore: number
  sentimentScore: number
  momentumScore: number
  riskScore: number
  allDetails: Record<string, string>
  symbol: string
  signalFreshness: Record<string, SignalFreshness>
}

export function computeCompositeScore(input: CompositeInput): StockScore {
  const overall = Math.round(
    input.technicalScore * WEIGHTS.technical +
    input.fundamentalScore * WEIGHTS.fundamental +
    input.sentimentScore * WEIGHTS.sentiment +
    input.momentumScore * WEIGHTS.momentum +
    input.riskScore * WEIGHTS.risk
  )

  const clampedOverall = Math.max(0, Math.min(100, overall))

  const keyDrivers = extractKeyDrivers(
    [
      { label: "Momentum", score: input.momentumScore, prefix: "mom_" },
      { label: "Fundamental", score: input.fundamentalScore, prefix: "fund_" },
      { label: "Technical", score: input.technicalScore, prefix: "tech_" },
      { label: "Sentiment", score: input.sentimentScore, prefix: "sent_" },
      { label: "Risk", score: input.riskScore, prefix: "risk_" },
    ],
    input.allDetails,
  )

  return {
    symbol: input.symbol,
    overall: clampedOverall,
    grade: toLetterGrade(clampedOverall),
    technical: input.technicalScore,
    fundamental: input.fundamentalScore,
    sentiment: input.sentimentScore,
    momentum: input.momentumScore,
    risk: input.riskScore,
    keyDrivers,
    signalFreshness: input.signalFreshness,
    details: input.allDetails,
  }
}

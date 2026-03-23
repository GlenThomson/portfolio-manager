/**
 * Two-part scoring system:
 *
 * 1. Investment Grade — "Is this a good business?"
 *    Weights: Business Quality 50%, Growth & Earnings 25%, Financial Health 15%,
 *             Insider Confidence 5%, Downside Risk 5%
 *
 * 2. Entry Signal — "Is now a good time to buy?"
 *    Based on technical indicators that suggest the stock is discounted/oversold.
 *    RSI, Bollinger %B, distance from SMA200, drawdown from recent high.
 */

export type SignalFreshness = "fresh" | "aging" | "stale"

export type EntrySignal = "Strong Buy" | "Buy" | "Hold" | "Wait" | "Overextended"

export interface StockScore {
  symbol: string
  // Investment Grade
  overall: number
  grade: string
  // Sub-scores for investment grade
  businessQuality: number
  growthAndEarnings: number
  financialHealth: number
  // Entry Signal
  entryScore: number
  entrySignal: EntrySignal
  // Legacy sub-scores (kept for detail breakdown)
  technical: number
  fundamental: number
  sentiment: number
  momentum: number
  risk: number
  // Metadata
  keyDrivers: string[]
  entryDrivers: string[]
  signalFreshness: Record<string, SignalFreshness>
  details: Record<string, string>
  insufficientData: boolean
  dataCoverage: number
}

const INVESTMENT_WEIGHTS = {
  businessQuality: 0.50,   // fundamental (sector-relative P/E, margins, ROE, FCF yield)
  growthAndEarnings: 0.25, // EPS revisions + revenue/EPS growth
  financialHealth: 0.15,   // debt/equity, FCF, balance sheet
  insider: 0.05,           // insider buying signal
  downsideRisk: 0.05,      // max drawdown only (not beta/ATR)
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

export function toEntrySignal(score: number): EntrySignal {
  if (score >= 80) return "Strong Buy"
  if (score >= 60) return "Buy"
  if (score >= 40) return "Hold"
  if (score >= 25) return "Wait"
  return "Overextended"
}

/**
 * Extract top 3 key drivers — the factors with the largest deviation from neutral (50).
 */
function extractKeyDrivers(
  scores: { label: string; score: number; prefix: string }[],
  allDetails: Record<string, string>,
): string[] {
  const sorted = [...scores].sort(
    (a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50)
  )

  const drivers: string[] = []

  for (const factor of sorted) {
    if (drivers.length >= 3) break

    const direction = factor.score >= 50 ? "positive" : "negative"

    const relevantDetails = Object.entries(allDetails)
      .filter(([k]) => k.startsWith(factor.prefix))
      .map(([, v]) => v)
      .filter(Boolean)

    if (relevantDetails.length > 0) {
      drivers.push(`${factor.label} (${direction}): ${relevantDetails[0]}`)
    } else if (Math.abs(factor.score - 50) >= 10) {
      drivers.push(`${factor.label}: ${direction} signal (score ${factor.score})`)
    }
  }

  return drivers
}

function extractEntryDrivers(allDetails: Record<string, string>): string[] {
  return Object.entries(allDetails)
    .filter(([k]) => k.startsWith("entry_"))
    .map(([, v]) => v)
    .filter(Boolean)
}

export interface CompositeInput {
  // Investment grade inputs
  fundamentalScore: number
  growthScore: number       // EPS revisions + growth metrics
  financialHealthScore: number
  insiderScore: number      // insider buying sub-score (0-100)
  downsideRiskScore: number // max drawdown only (0-100, higher = safer)
  // Entry signal inputs
  entryScore: number
  // Legacy (kept for detail breakdown)
  technicalScore: number
  sentimentScore: number
  momentumScore: number
  riskScore: number
  // Metadata
  allDetails: Record<string, string>
  symbol: string
  signalFreshness: Record<string, SignalFreshness>
}

export function computeCompositeScore(input: CompositeInput): StockScore {
  // Check data coverage
  const freshnessValues = Object.values(input.signalFreshness)
  const totalFactors = freshnessValues.length
  const coveredFactors = freshnessValues.filter((f) => f !== "stale").length
  const dataCoverage = totalFactors > 0 ? coveredFactors / totalFactors : 0
  const insufficientData = coveredFactors <= 2

  // Investment Grade — weighted sum of business quality factors
  const investmentRaw = Math.round(
    input.fundamentalScore * INVESTMENT_WEIGHTS.businessQuality +
    input.growthScore * INVESTMENT_WEIGHTS.growthAndEarnings +
    input.financialHealthScore * INVESTMENT_WEIGHTS.financialHealth +
    input.insiderScore * INVESTMENT_WEIGHTS.insider +
    input.downsideRiskScore * INVESTMENT_WEIGHTS.downsideRisk
  )
  const overall = Math.max(0, Math.min(100, investmentRaw))

  // Entry Signal — passed in directly from entry score computation
  const entryScore = Math.max(0, Math.min(100, input.entryScore))

  // Key drivers for investment grade
  const investmentFactors = [
    { label: "Business Quality", score: input.fundamentalScore, prefix: "fund_" },
    { label: "Growth & Earnings", score: input.growthScore, prefix: "growth_" },
    { label: "Financial Health", score: input.financialHealthScore, prefix: "health_" },
    { label: "Insider Activity", score: input.insiderScore, prefix: "insider_" },
  ]
  const keyDrivers = extractKeyDrivers(investmentFactors, input.allDetails)

  if (insufficientData) {
    const staleFactors = Object.entries(input.signalFreshness)
      .filter(([, v]) => v === "stale")
      .map(([k]) => k)
    keyDrivers.unshift(`Insufficient data: ${staleFactors.join(", ")} signals are stale — score may not be reliable`)
  }

  const entryDrivers = extractEntryDrivers(input.allDetails)

  return {
    symbol: input.symbol,
    overall,
    grade: insufficientData ? "N/A" : toLetterGrade(overall),
    businessQuality: input.fundamentalScore,
    growthAndEarnings: input.growthScore,
    financialHealth: input.financialHealthScore,
    entryScore,
    entrySignal: toEntrySignal(entryScore),
    // Legacy sub-scores for detail breakdown
    technical: input.technicalScore,
    fundamental: input.fundamentalScore,
    sentiment: input.sentimentScore,
    momentum: input.momentumScore,
    risk: input.riskScore,
    keyDrivers,
    entryDrivers,
    signalFreshness: input.signalFreshness,
    details: input.allDetails,
    insufficientData,
    dataCoverage,
  }
}

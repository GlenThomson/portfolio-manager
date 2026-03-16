import YahooFinance from "yahoo-finance2"
import { getQuote } from "@/lib/market/yahoo"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
})

export interface PortfolioHealthReport {
  overallScore: number // 0-100
  grade: string // A+ to F

  // Sector Analysis
  sectorAllocation: { sector: string; weight: number; count: number }[]
  sectorConcentrationScore: number // 0-100, higher = more diversified

  // Position Concentration
  topHoldings: { symbol: string; weight: number }[]
  concentrationWarnings: string[] // e.g. "AAPL is 45% of portfolio"

  // Risk Metrics
  portfolioBeta: number // Weighted average beta
  highBetaExposure: number // % of portfolio in beta > 1.5 stocks

  // Diversification
  numberOfPositions: number
  diversificationScore: number // 0-100

  // Suggestions
  suggestions: string[] // Actionable suggestions
}

interface PositionInput {
  symbol: string
  quantity: number
  averageCost: number
}

const DEFENSIVE_SECTORS = [
  "Utilities",
  "Consumer Defensive",
  "Healthcare",
  "Consumer Staples",
]

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+"
  if (score >= 90) return "A"
  if (score >= 85) return "A-"
  if (score >= 80) return "B+"
  if (score >= 75) return "B"
  if (score >= 70) return "B-"
  if (score >= 65) return "C+"
  if (score >= 60) return "C"
  if (score >= 55) return "C-"
  if (score >= 50) return "D+"
  if (score >= 45) return "D"
  if (score >= 40) return "D-"
  return "F"
}

export async function analyzePortfolioHealth(
  positions: PositionInput[]
): Promise<PortfolioHealthReport> {
  if (positions.length === 0) {
    return {
      overallScore: 0,
      grade: "F",
      sectorAllocation: [],
      sectorConcentrationScore: 0,
      topHoldings: [],
      concentrationWarnings: ["Portfolio has no positions"],
      portfolioBeta: 0,
      highBetaExposure: 0,
      numberOfPositions: 0,
      diversificationScore: 0,
      suggestions: ["Add positions to your portfolio to get a health analysis"],
    }
  }

  // 1. Fetch current prices for all symbols
  const quotes = await Promise.all(
    positions.map(async (p) => {
      try {
        return await getQuote(p.symbol)
      } catch {
        return null
      }
    })
  )

  const priceMap = new Map<string, number>()
  quotes.forEach((q) => {
    if (q) priceMap.set(q.symbol, q.regularMarketPrice)
  })

  // 2. Fetch sector and beta data via quoteSummary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryData = new Map<string, { sector: string; beta: number }>()
  await Promise.all(
    positions.map(async (p) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yahooFinance.quoteSummary(
          p.symbol,
          { modules: ["summaryProfile", "defaultKeyStatistics"] },
          { validateResult: false }
        )
        const sector =
          result?.summaryProfile?.sector ?? "Unknown"
        const beta = result?.defaultKeyStatistics?.beta ?? 1.0
        summaryData.set(p.symbol, { sector, beta: Number(beta) || 1.0 })
      } catch {
        summaryData.set(p.symbol, { sector: "Unknown", beta: 1.0 })
      }
    })
  )

  // 3. Calculate position weights
  const positionsWithValues = positions.map((p) => {
    const currentPrice = priceMap.get(p.symbol) ?? p.averageCost
    const marketValue = p.quantity * currentPrice
    const data = summaryData.get(p.symbol) ?? { sector: "Unknown", beta: 1.0 }
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      marketValue,
      sector: data.sector,
      beta: data.beta,
      weight: 0, // computed below
    }
  })

  const totalValue = positionsWithValues.reduce(
    (sum, p) => sum + p.marketValue,
    0
  )

  if (totalValue <= 0) {
    return {
      overallScore: 0,
      grade: "F",
      sectorAllocation: [],
      sectorConcentrationScore: 0,
      topHoldings: [],
      concentrationWarnings: ["Portfolio has zero market value"],
      portfolioBeta: 0,
      highBetaExposure: 0,
      numberOfPositions: positions.length,
      diversificationScore: 0,
      suggestions: ["Your portfolio positions have no market value"],
    }
  }

  positionsWithValues.forEach((p) => {
    p.weight = p.marketValue / totalValue
  })

  // 4. Sector allocation
  const sectorMap = new Map<string, { weight: number; count: number }>()
  positionsWithValues.forEach((p) => {
    const existing = sectorMap.get(p.sector) ?? { weight: 0, count: 0 }
    existing.weight += p.weight
    existing.count += 1
    sectorMap.set(p.sector, existing)
  })

  const sectorAllocation = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      weight: Math.round(data.weight * 10000) / 100,
      count: data.count,
    }))
    .sort((a, b) => b.weight - a.weight)

  // 5. HHI-based concentration score (position-level)
  const positionHHI = positionsWithValues.reduce(
    (sum, p) => sum + p.weight * p.weight,
    0
  )
  // Score: (1 - HHI) * 100, clamped to 0-100
  const diversificationScore = Math.round(
    Math.max(0, Math.min(100, (1 - positionHHI) * 100))
  )

  // Sector-level HHI
  const sectorWeights = Array.from(sectorMap.values()).map((s) => s.weight)
  const sectorHHI = sectorWeights.reduce((sum, w) => sum + w * w, 0)
  const sectorConcentrationScore = Math.round(
    Math.max(0, Math.min(100, (1 - sectorHHI) * 100))
  )

  // 6. Top holdings
  const topHoldings = positionsWithValues
    .map((p) => ({
      symbol: p.symbol,
      weight: Math.round(p.weight * 10000) / 100,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)

  // 7. Risk metrics
  const portfolioBeta =
    Math.round(
      positionsWithValues.reduce((sum, p) => sum + p.beta * p.weight, 0) * 100
    ) / 100

  const highBetaExposure =
    Math.round(
      positionsWithValues
        .filter((p) => p.beta > 1.5)
        .reduce((sum, p) => sum + p.weight, 0) * 10000
    ) / 100

  // 8. Concentration warnings
  const concentrationWarnings: string[] = []
  positionsWithValues.forEach((p) => {
    if (p.weight > 0.25) {
      concentrationWarnings.push(
        `${p.symbol} is ${(p.weight * 100).toFixed(1)}% of portfolio`
      )
    }
  })

  // 9. Suggestions
  const suggestions: string[] = []

  positionsWithValues.forEach((p) => {
    if (p.weight > 0.25) {
      suggestions.push(
        `Consider trimming ${p.symbol} — it represents ${(p.weight * 100).toFixed(1)}% of your portfolio`
      )
    }
  })

  sectorAllocation.forEach((s) => {
    if (s.weight > 40) {
      suggestions.push(
        `Heavy ${s.sector} concentration (${s.weight.toFixed(1)}%). Consider diversifying into other sectors`
      )
    }
  })

  if (positions.length < 5) {
    suggestions.push(
      `Only ${positions.length} position${positions.length === 1 ? "" : "s"}. Consider adding more stocks for better diversification`
    )
  }

  if (portfolioBeta > 1.3) {
    suggestions.push(
      `Portfolio beta of ${portfolioBeta.toFixed(2)} is aggressive. Consider adding lower-beta holdings`
    )
  }

  const hasSectors = new Set(positionsWithValues.map((p) => p.sector))
  const hasDefensive = DEFENSIVE_SECTORS.some((s) => hasSectors.has(s))
  if (!hasDefensive && positions.length >= 3) {
    suggestions.push(
      "No defensive sector exposure. Consider adding utilities, consumer staples, or healthcare for downside protection"
    )
  }

  // 10. Overall score: weighted average of sub-scores
  // Diversification (35%), Sector diversification (25%), Beta risk (20%), Position count (20%)
  const positionCountScore = Math.min(100, positions.length * 10) // 10 positions = max score
  const betaScore =
    portfolioBeta <= 0.8
      ? 70 // too defensive
      : portfolioBeta <= 1.0
        ? 100
        : portfolioBeta <= 1.2
          ? 85
          : portfolioBeta <= 1.5
            ? 60
            : 30

  const overallScore = Math.round(
    diversificationScore * 0.35 +
      sectorConcentrationScore * 0.25 +
      betaScore * 0.2 +
      positionCountScore * 0.2
  )

  return {
    overallScore,
    grade: scoreToGrade(overallScore),
    sectorAllocation,
    sectorConcentrationScore,
    topHoldings,
    concentrationWarnings,
    portfolioBeta,
    highBetaExposure,
    numberOfPositions: positions.length,
    diversificationScore,
    suggestions,
  }
}

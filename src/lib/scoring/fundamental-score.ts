/**
 * Fundamental score (0-100) based on valuation, profitability, and growth metrics.
 * Uses sector-relative thresholds so tech companies are compared against tech peers,
 * utilities against utilities, etc.
 */

export interface FundamentalInput {
  forwardPE: number | null
  revenueGrowth: number | null // as decimal (0.15 = 15%)
  profitMargin: number | null // as decimal
  returnOnEquity: number | null // as decimal
  epsGrowth: number | null // as decimal
  sector: string | null // GICS sector name from Yahoo Finance
}

export interface FundamentalScoreResult {
  score: number
  details: Record<string, string>
}

// Sector median benchmarks (approximate, based on S&P 500 sector medians)
// Each entry: { forwardPE, revenueGrowth (%), profitMargin (%), roe (%) }
interface SectorBenchmark {
  forwardPE: number
  revenueGrowth: number
  profitMargin: number
  roe: number
}

const SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  "Technology":              { forwardPE: 28, revenueGrowth: 12, profitMargin: 22, roe: 25 },
  "Communication Services":  { forwardPE: 20, revenueGrowth: 8,  profitMargin: 18, roe: 15 },
  "Consumer Cyclical":       { forwardPE: 22, revenueGrowth: 8,  profitMargin: 8,  roe: 18 },
  "Consumer Defensive":      { forwardPE: 20, revenueGrowth: 4,  profitMargin: 8,  roe: 20 },
  "Healthcare":              { forwardPE: 22, revenueGrowth: 10, profitMargin: 15, roe: 18 },
  "Financial Services":      { forwardPE: 14, revenueGrowth: 6,  profitMargin: 25, roe: 12 },
  "Industrials":             { forwardPE: 20, revenueGrowth: 6,  profitMargin: 10, roe: 18 },
  "Energy":                  { forwardPE: 12, revenueGrowth: 5,  profitMargin: 10, roe: 15 },
  "Utilities":               { forwardPE: 16, revenueGrowth: 3,  profitMargin: 14, roe: 10 },
  "Real Estate":             { forwardPE: 30, revenueGrowth: 5,  profitMargin: 25, roe: 8  },
  "Basic Materials":         { forwardPE: 15, revenueGrowth: 5,  profitMargin: 10, roe: 14 },
}

const DEFAULT_BENCHMARK: SectorBenchmark = { forwardPE: 20, revenueGrowth: 8, profitMargin: 12, roe: 16 }

function getBenchmark(sector: string | null): SectorBenchmark {
  if (!sector) return DEFAULT_BENCHMARK
  return SECTOR_BENCHMARKS[sector] ?? DEFAULT_BENCHMARK
}

/**
 * Score a metric relative to its sector median.
 * Returns 0-20 points based on how far above/below the sector median the value is.
 */
function scoreRelative(
  value: number | null,
  sectorMedian: number,
  higherIsBetter: boolean,
): { points: number; tier: string } {
  if (value == null || isNaN(value)) return { points: 0, tier: "unavailable" }

  // Calculate how far the value is from the sector median as a ratio
  let ratio: number
  if (higherIsBetter) {
    ratio = sectorMedian !== 0 ? value / sectorMedian : (value > 0 ? 2 : 0.5)
  } else {
    // For P/E: lower is better, so invert the ratio
    ratio = value > 0 && sectorMedian > 0 ? sectorMedian / value : 0.5
  }

  // Map ratio to points: >1.5x median = excellent, 1-1.5x = good, 0.5-1x = fair, <0.5x = poor
  if (ratio >= 1.5) return { points: 20, tier: "well above sector" }
  if (ratio >= 1.0) return { points: 14, tier: "above sector avg" }
  if (ratio >= 0.5) return { points: 8,  tier: "below sector avg" }
  return { points: 2, tier: "well below sector" }
}

export function computeFundamentalScore(input: FundamentalInput): FundamentalScoreResult {
  const details: Record<string, string> = {}
  let totalPoints = 0
  let metricCount = 0
  const bench = getBenchmark(input.sector)
  const sectorLabel = input.sector ?? "market"

  // Forward P/E: lower is better (relative to sector)
  if (input.forwardPE != null && !isNaN(input.forwardPE) && input.forwardPE > 0) {
    const { points, tier } = scoreRelative(input.forwardPE, bench.forwardPE, false)
    totalPoints += points
    metricCount++
    details.forwardPE = `Forward P/E ${input.forwardPE.toFixed(1)} vs ${sectorLabel} median ~${bench.forwardPE} — ${tier}`
  } else {
    details.forwardPE = "Forward P/E unavailable"
  }

  // Revenue growth: higher is better (relative to sector)
  if (input.revenueGrowth != null && !isNaN(input.revenueGrowth)) {
    const pct = input.revenueGrowth * 100
    const { points, tier } = scoreRelative(pct, bench.revenueGrowth, true)
    totalPoints += points
    metricCount++
    details.revenueGrowth = `Revenue growth ${pct.toFixed(1)}% vs ${sectorLabel} median ~${bench.revenueGrowth}% — ${tier}`
  } else {
    details.revenueGrowth = "Revenue growth unavailable"
  }

  // Profit margin: higher is better (relative to sector)
  if (input.profitMargin != null && !isNaN(input.profitMargin)) {
    const pct = input.profitMargin * 100
    const { points, tier } = scoreRelative(pct, bench.profitMargin, true)
    totalPoints += points
    metricCount++
    details.profitMargin = `Profit margin ${pct.toFixed(1)}% vs ${sectorLabel} median ~${bench.profitMargin}% — ${tier}`
  } else {
    details.profitMargin = "Profit margin unavailable"
  }

  // ROE: higher is better (relative to sector)
  if (input.returnOnEquity != null && !isNaN(input.returnOnEquity)) {
    const pct = input.returnOnEquity * 100
    const { points, tier } = scoreRelative(pct, bench.roe, true)
    totalPoints += points
    metricCount++
    details.returnOnEquity = `ROE ${pct.toFixed(1)}% vs ${sectorLabel} median ~${bench.roe}% — ${tier}`
  } else {
    details.returnOnEquity = "ROE unavailable"
  }

  // EPS growth: higher is better (use absolute thresholds — growth varies too much within sectors)
  if (input.epsGrowth != null && !isNaN(input.epsGrowth)) {
    const pct = input.epsGrowth * 100
    if (pct >= 25) {
      totalPoints += 20
      details.epsGrowth = `EPS growth ${pct.toFixed(1)}% — excellent`
    } else if (pct >= 10) {
      totalPoints += 14
      details.epsGrowth = `EPS growth ${pct.toFixed(1)}% — good`
    } else if (pct >= 0) {
      totalPoints += 8
      details.epsGrowth = `EPS growth ${pct.toFixed(1)}% — fair`
    } else {
      totalPoints += 2
      details.epsGrowth = `EPS growth ${pct.toFixed(1)}% — declining`
    }
    metricCount++
  } else {
    details.epsGrowth = "EPS growth unavailable"
  }

  // Note: analyst recommendation is scored in sentiment-score.ts only (avoid double-counting)

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

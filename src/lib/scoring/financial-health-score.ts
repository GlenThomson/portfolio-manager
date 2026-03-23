/**
 * Financial Health score (0-100) — balance sheet strength and cash generation.
 * For long-term investors: can this company survive downturns and fund its own growth?
 *
 * Sub-scores:
 *   Debt to equity: 35% — leverage risk
 *   Free cash flow yield: 35% — actual cash generation relative to market cap
 *   Current ratio: 15% — short-term liquidity
 *   Interest coverage (operating income / interest expense): 15%
 */

export interface FinancialHealthInput {
  debtToEquity: number | null
  freeCashflow: number | null
  marketCap: number | null
  currentRatio: number | null
  operatingIncome: number | null
  interestExpense: number | null
}

export interface FinancialHealthResult {
  score: number
  fcfYield: number | null
  details: Record<string, string>
}

function scoreDebtToEquity(de: number | null): { points: number; detail: string } {
  if (de == null || isNaN(de)) return { points: 50, detail: "Debt/equity data unavailable" }

  // Negative D/E usually means negative equity (very bad) or net cash (context dependent)
  if (de < 0) return { points: 20, detail: `Debt/equity ${de.toFixed(1)} — negative equity, investigate` }
  if (de <= 0.3) return { points: 90, detail: `Debt/equity ${de.toFixed(2)} — very low leverage` }
  if (de <= 0.7) return { points: 75, detail: `Debt/equity ${de.toFixed(2)} — conservative leverage` }
  if (de <= 1.5) return { points: 55, detail: `Debt/equity ${de.toFixed(2)} — moderate leverage` }
  if (de <= 3.0) return { points: 30, detail: `Debt/equity ${de.toFixed(2)} — high leverage` }
  return { points: 10, detail: `Debt/equity ${de.toFixed(2)} — very high leverage, elevated risk` }
}

function scoreFcfYield(fcf: number | null, marketCap: number | null): { points: number; yield: number | null; detail: string } {
  if (fcf == null || marketCap == null || marketCap <= 0) {
    return { points: 50, yield: null, detail: "Free cash flow data unavailable" }
  }

  const yieldPct = (fcf / marketCap) * 100

  if (fcf < 0) return { points: 10, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — burning cash` }
  if (yieldPct >= 8) return { points: 90, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — excellent cash generation` }
  if (yieldPct >= 5) return { points: 75, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — strong cash generation` }
  if (yieldPct >= 3) return { points: 60, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — solid cash generation` }
  if (yieldPct >= 1) return { points: 40, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — modest cash generation` }
  return { points: 20, yield: yieldPct, detail: `FCF yield ${yieldPct.toFixed(1)}% — weak cash generation` }
}

function scoreCurrentRatio(cr: number | null): { points: number; detail: string } {
  if (cr == null || isNaN(cr)) return { points: 50, detail: "Current ratio data unavailable" }

  if (cr >= 3.0) return { points: 70, detail: `Current ratio ${cr.toFixed(2)} — very liquid (possibly inefficient capital use)` }
  if (cr >= 1.5) return { points: 85, detail: `Current ratio ${cr.toFixed(2)} — healthy liquidity` }
  if (cr >= 1.0) return { points: 55, detail: `Current ratio ${cr.toFixed(2)} — adequate liquidity` }
  if (cr >= 0.7) return { points: 30, detail: `Current ratio ${cr.toFixed(2)} — tight liquidity` }
  return { points: 10, detail: `Current ratio ${cr.toFixed(2)} — liquidity risk` }
}

function scoreInterestCoverage(opIncome: number | null, intExpense: number | null): { points: number; detail: string } {
  if (opIncome == null || intExpense == null) {
    return { points: 50, detail: "Interest coverage data unavailable" }
  }

  // No debt or negligible interest
  if (intExpense === 0 || Math.abs(intExpense) < 1000) {
    return { points: 85, detail: "Negligible interest expense — no debt burden" }
  }

  const coverage = opIncome / Math.abs(intExpense)

  if (coverage >= 10) return { points: 90, detail: `Interest coverage ${coverage.toFixed(1)}x — easily covers debt` }
  if (coverage >= 5) return { points: 75, detail: `Interest coverage ${coverage.toFixed(1)}x — comfortable` }
  if (coverage >= 2) return { points: 50, detail: `Interest coverage ${coverage.toFixed(1)}x — adequate` }
  if (coverage >= 1) return { points: 25, detail: `Interest coverage ${coverage.toFixed(1)}x — tight, risk of strain` }
  return { points: 10, detail: `Interest coverage ${coverage.toFixed(1)}x — cannot cover interest, distress risk` }
}

export function computeFinancialHealthScore(input: FinancialHealthInput): FinancialHealthResult {
  const deResult = scoreDebtToEquity(input.debtToEquity)
  const fcfResult = scoreFcfYield(input.freeCashflow, input.marketCap)
  const crResult = scoreCurrentRatio(input.currentRatio)
  const icResult = scoreInterestCoverage(input.operatingIncome, input.interestExpense)

  const score = Math.round(
    deResult.points * 0.35 +
    fcfResult.points * 0.35 +
    crResult.points * 0.15 +
    icResult.points * 0.15
  )

  return {
    score: Math.max(0, Math.min(100, score)),
    fcfYield: fcfResult.yield,
    details: {
      debtToEquity: deResult.detail,
      fcfYield: fcfResult.detail,
      currentRatio: crResult.detail,
      interestCoverage: icResult.detail,
    },
  }
}

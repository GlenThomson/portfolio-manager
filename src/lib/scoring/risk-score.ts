/**
 * Risk score (0-100) where LOWER risk = HIGHER score.
 * Combines beta, ATR volatility, and max drawdown.
 *
 * Sub-score weights:
 *   Beta: 40%
 *   ATR volatility (%): 30%
 *   Max drawdown: 30%
 */

export interface RiskInput {
  beta: number | null
  atrPercent: number | null // ATR / price * 100
  maxDrawdownPercent: number | null // max drawdown as positive %
}

export interface RiskScoreResult {
  score: number
  details: Record<string, string>
}

function scoreBeta(beta: number | null): { points: number; detail: string } {
  if (beta == null || isNaN(beta)) {
    return { points: 50, detail: "Beta data unavailable" }
  }

  // Beta near 1.0 is neutral; lower is safer, higher is riskier
  if (beta <= 0.5) return { points: 90, detail: `Beta ${beta.toFixed(2)} — very low volatility relative to market` }
  if (beta <= 0.8) return { points: 75, detail: `Beta ${beta.toFixed(2)} — low risk, defensive stock` }
  if (beta <= 1.0) return { points: 60, detail: `Beta ${beta.toFixed(2)} — in line with market` }
  if (beta <= 1.2) return { points: 45, detail: `Beta ${beta.toFixed(2)} — slightly above market risk` }
  if (beta <= 1.5) return { points: 30, detail: `Beta ${beta.toFixed(2)} — elevated risk` }
  return { points: 15, detail: `Beta ${beta.toFixed(2)} — high volatility, aggressive` }
}

function scoreAtr(atrPct: number | null): { points: number; detail: string } {
  if (atrPct == null || isNaN(atrPct)) {
    return { points: 50, detail: "ATR data unavailable" }
  }

  // ATR as % of price — lower is calmer
  if (atrPct < 1.5) return { points: 85, detail: `ATR ${atrPct.toFixed(1)}% of price — very low daily volatility` }
  if (atrPct < 2.5) return { points: 70, detail: `ATR ${atrPct.toFixed(1)}% of price — low volatility` }
  if (atrPct < 4.0) return { points: 50, detail: `ATR ${atrPct.toFixed(1)}% of price — moderate volatility` }
  if (atrPct < 6.0) return { points: 30, detail: `ATR ${atrPct.toFixed(1)}% of price — high daily swings` }
  return { points: 15, detail: `ATR ${atrPct.toFixed(1)}% of price — extreme daily volatility` }
}

function scoreDrawdown(dd: number | null): { points: number; detail: string } {
  if (dd == null || isNaN(dd)) {
    return { points: 50, detail: "Drawdown data unavailable" }
  }

  // Max drawdown — shallower is better
  if (dd < 10) return { points: 85, detail: `Max drawdown ${dd.toFixed(1)}% — shallow, resilient` }
  if (dd < 20) return { points: 65, detail: `Max drawdown ${dd.toFixed(1)}% — moderate pullback` }
  if (dd < 35) return { points: 40, detail: `Max drawdown ${dd.toFixed(1)}% — significant decline` }
  if (dd < 50) return { points: 20, detail: `Max drawdown ${dd.toFixed(1)}% — deep drawdown` }
  return { points: 10, detail: `Max drawdown ${dd.toFixed(1)}% — severe, recovery uncertain` }
}

/**
 * Compute max drawdown from a series of closing prices.
 * Returns a positive percentage (e.g., 25.3 means -25.3% from peak).
 */
export function computeMaxDrawdown(closes: number[]): number {
  if (closes.length < 2) return 0

  let peak = closes[0]
  let maxDd = 0

  for (const price of closes) {
    if (price > peak) peak = price
    const dd = ((peak - price) / peak) * 100
    if (dd > maxDd) maxDd = dd
  }

  return maxDd
}

export function computeRiskScore(input: RiskInput): RiskScoreResult {
  const betaResult = scoreBeta(input.beta)
  const atrResult = scoreAtr(input.atrPercent)
  const ddResult = scoreDrawdown(input.maxDrawdownPercent)

  const score = Math.round(
    betaResult.points * 0.4 + atrResult.points * 0.3 + ddResult.points * 0.3
  )

  return {
    score: Math.max(0, Math.min(100, score)),
    details: {
      beta: betaResult.detail,
      atr: atrResult.detail,
      maxDrawdown: ddResult.detail,
    },
  }
}

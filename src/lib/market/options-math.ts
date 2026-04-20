/**
 * Black-Scholes options pricing math.
 * Pure functions — no external dependencies.
 */

// ── Standard Normal CDF (Abramowitz & Stegun approximation) ──

function cumNormalDist(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1.0 / (1.0 + p * absX)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2)

  return 0.5 * (1.0 + sign * y)
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

// ── Greeks ──────────────────────────────────────────────────

export interface Greeks {
  delta: number
  gamma: number
  theta: number  // per day
  vega: number   // per 1% move in IV
}

/**
 * Compute Black-Scholes Greeks.
 * @param S - underlying price
 * @param K - strike price
 * @param T - time to expiry in years
 * @param r - risk-free rate (e.g. 0.045 for 4.5%)
 * @param sigma - implied volatility (e.g. 0.30 for 30%)
 * @param type - 'call' or 'put'
 */
export function blackScholesGreeks(
  S: number, K: number, T: number, r: number, sigma: number, type: "call" | "put"
): Greeks {
  // Edge cases
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0)
    return {
      delta: intrinsic > 0 ? (type === "call" ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
    }
  }

  const sqrtT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT

  const nd1 = cumNormalDist(d1)
  const nd2 = cumNormalDist(d2)
  const pd1 = normalPdf(d1)
  const expRT = Math.exp(-r * T)

  const gamma = pd1 / (S * sigma * sqrtT)
  const vega = (S * pd1 * sqrtT) / 100 // per 1% IV move

  if (type === "call") {
    return {
      delta: nd1,
      gamma,
      theta: (-(S * pd1 * sigma) / (2 * sqrtT) - r * K * expRT * nd2) / 365,
      vega,
    }
  } else {
    return {
      delta: nd1 - 1,
      gamma,
      theta: (-(S * pd1 * sigma) / (2 * sqrtT) + r * K * expRT * (1 - nd2)) / 365,
      vega,
    }
  }
}

// ── Premium Yield ───────────────────────────────────────────

/**
 * Annualized return if the option expires worthless.
 * Uses bid price (what seller actually receives).
 */
export function premiumYield(bid: number, strike: number, daysToExpiry: number): number {
  if (strike <= 0 || daysToExpiry <= 0 || bid <= 0) return 0
  return (bid / strike) * (365 / daysToExpiry) * 100
}

// ── IV Statistics ───────────────────────────────────────────

/**
 * Compute IV rank and percentile from a set of IV values across the chain.
 * This uses the current chain's IV distribution as a proxy.
 * A more accurate version would use 52-week historical IV.
 */
export function ivStats(ivValues: number[]): { avg: number; high: number; low: number; median: number } {
  const valid = ivValues.filter((v) => v > 0.001) // filter out near-zero garbage
  if (valid.length === 0) return { avg: 0, high: 0, low: 0, median: 0 }

  valid.sort((a, b) => a - b)
  const avg = valid.reduce((s, v) => s + v, 0) / valid.length
  const median = valid[Math.floor(valid.length / 2)]

  return {
    avg: avg * 100,
    high: valid[valid.length - 1] * 100,
    low: valid[0] * 100,
    median: median * 100,
  }
}

/**
 * IV Rank: where current IV sits relative to 52-week high/low.
 * (currentIV - lowIV) / (highIV - lowIV) * 100
 */
export function ivRank(currentIV: number, lowIV: number, highIV: number): number {
  if (highIV <= lowIV) return 50
  return Math.max(0, Math.min(100, ((currentIV - lowIV) / (highIV - lowIV)) * 100))
}

// ── Historical Volatility ──────────────────────────────────

/**
 * Compute 20-day historical (realised) volatility from daily closes.
 * Returns { hv20, hvAnnualized } as percentages.
 */
export function historicalVolatility(closes: number[], window = 20): { hv20: number; hvAnnualized: number } {
  if (closes.length < window + 1) return { hv20: 0, hvAnnualized: 0 }

  // Use the most recent `window` log returns
  const recent = closes.slice(-(window + 1))
  const logReturns: number[] = []
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) logReturns.push(Math.log(recent[i] / recent[i - 1]))
  }
  if (logReturns.length < 2) return { hv20: 0, hvAnnualized: 0 }

  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1)
  const dailyVol = Math.sqrt(variance)
  const annualized = dailyVol * Math.sqrt(252)

  return { hv20: dailyVol * 100, hvAnnualized: annualized * 100 }
}

/**
 * Compute rolling annualised HV series from a time-aligned list of closes.
 * For each day i ≥ window, HV at day i is computed from the prior `window` log returns.
 * Returns [{ time, hv }] where hv is annualised percentage.
 */
export function rollingHistoricalVolatility(
  bars: { time: number; close: number }[],
  window = 20,
): { time: number; hv: number }[] {
  if (bars.length < window + 1) return []

  // Precompute log returns
  const logReturns: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close
    const cur = bars[i].close
    logReturns.push(prev > 0 && cur > 0 ? Math.log(cur / prev) : 0)
  }

  const series: { time: number; hv: number }[] = []
  for (let i = window; i < bars.length; i++) {
    const slice = logReturns.slice(i - window, i)
    const mean = slice.reduce((s, r) => s + r, 0) / slice.length
    const variance = slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (slice.length - 1)
    const dailyVol = Math.sqrt(variance)
    const annualised = dailyVol * Math.sqrt(252) * 100
    series.push({ time: bars[i].time, hv: annualised })
  }
  return series
}

// ── Options Pendulum ───────────────────────────────────────

export interface PendulumData {
  score: number          // 0-100
  label: string
  context: "sell" | "buy" | "balanced" // DTE-based context
  ivRankSignal: number   // 0-100
  ivHvSignal: number     // 0-100
  skewSignal: number     // 0-100
  yieldSignal: number    // 0-100
  hv20: number
  hvAnnualized: number
  dte: number
  atmIV: number
  hvHistory: { time: number; hv: number }[]
  hvHistory10?: { time: number; hv: number }[]
}

/** Clamp and linearly interpolate */
function lerp(value: number, inLow: number, inHigh: number, outLow = 0, outHigh = 100): number {
  const t = Math.max(0, Math.min(1, (value - inLow) / (inHigh - inLow || 1)))
  return outLow + t * (outHigh - outLow)
}

/**
 * Compute composite pendulum score, adapted by DTE.
 *
 * Short DTE (≤60d) → selling context: high score = good time to sell
 *   Weights: IV Rank 30%, IV/HV 25%, Yield 30%, Skew 15%
 *
 * LEAPS (>180d) → buying context: low score = good time to buy
 *   Weights: IV Rank 40%, IV/HV 40%, Skew 15%, Yield 5%
 *
 * Mid DTE (61-180d) → balanced weights
 */
export function pendulumScore(
  _ivRankVal: number, // legacy param kept for API compatibility
  atmIV: number,
  hvAnnualized: number,
  avgPutOtmIV: number,
  avgCallOtmIV: number,
  avgPremiumYield: number,
  dte: number,
  hvHistory: { time: number; hv: number }[] = [],
): PendulumData {
  // 1. IV Rank — percentile of current IV within the past year's HV distribution.
  // (True IV-history percentile requires historical IV snapshots we don't yet have.
  //  Using HV distribution as the reference is a well-accepted proxy: it answers
  //  "how does current IV compare to the actual vol this stock has been showing?")
  let ivRankSignal = 50
  if (hvHistory.length > 10 && atmIV > 0) {
    const below = hvHistory.filter((h) => h.hv < atmIV).length
    ivRankSignal = Math.round((below / hvHistory.length) * 100)
  }

  // 2. IV vs HV ratio — if IV >> HV, options are expensive (sell signal)
  // Wider range so more stocks spread across the scale (0.6 → 2.0 instead of 0.7 → 1.5)
  const ivHvRatio = hvAnnualized > 0 ? atmIV / hvAnnualized : 1
  const ivHvSignal = Math.round(lerp(ivHvRatio, 0.6, 2.0))

  // 3. Put/Call skew — high put IV vs call IV = fear premium
  // Widened to 0.85 → 1.5 so typical skew (≈1.0) maps closer to middle
  const skewRatio = avgCallOtmIV > 0 ? avgPutOtmIV / avgCallOtmIV : 1
  const skewSignal = Math.round(lerp(skewRatio, 0.85, 1.5))

  // 4. Premium yield NORMALISED by HV.
  // A 100% annualised yield on TSLA (HV ~50%) is normal.
  // A 100% annualised yield on KO (HV ~15%) is extraordinary.
  // Ratio < 0.9 → cheap (yield < stock's natural vol), > 1.5 → rich.
  const yieldHvRatio = hvAnnualized > 0 && avgPremiumYield > 0 ? avgPremiumYield / hvAnnualized : 1
  const yieldSignal = Math.round(lerp(yieldHvRatio, 0.9, 1.8))

  // DTE-based weighting
  let wIvRank: number, wIvHv: number, wSkew: number, wYield: number
  let context: "sell" | "buy" | "balanced"

  if (dte <= 60) {
    // Short-term: selling focus — yield matters most
    context = "sell"
    wIvRank = 0.30; wIvHv = 0.25; wSkew = 0.15; wYield = 0.30
  } else if (dte > 180) {
    // LEAPS: buying focus — IV cheapness matters most, yield barely matters
    context = "buy"
    wIvRank = 0.40; wIvHv = 0.40; wSkew = 0.15; wYield = 0.05
  } else {
    // Mid-term: balanced
    context = "balanced"
    wIvRank = 0.35; wIvHv = 0.30; wSkew = 0.15; wYield = 0.20
  }

  const score = Math.round(
    ivRankSignal * wIvRank +
    ivHvSignal * wIvHv +
    skewSignal * wSkew +
    yieldSignal * wYield
  )

  // Labels adapt to context
  let label: string
  if (context === "sell") {
    label = score >= 70 ? "Sell Now" : score >= 50 ? "Decent Premiums" : score >= 30 ? "Thin Premiums" : "Don't Sell"
  } else if (context === "buy") {
    label = score <= 30 ? "Buy Now" : score <= 50 ? "Fairly Priced" : score <= 70 ? "Expensive" : "Don't Buy"
  } else {
    label = score <= 30 ? "Buy Options" : score >= 70 ? "Sell Options" : "Neutral"
  }

  return {
    score,
    label,
    context,
    ivRankSignal,
    ivHvSignal,
    skewSignal,
    yieldSignal,
    hv20: 0,
    hvAnnualized,
    dte,
    atmIV,
    hvHistory: [], // caller populates
  }
}

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

// ── Historical Volatility ───────────────────────────────────

/**
 * Compute historical (realised) volatility from daily close prices.
 * @param closes - array of daily close prices (oldest first)
 * @param window - lookback period (default 20 trading days)
 */
export function historicalVolatility(closes: number[], window = 20): { hv20: number; hvAnnualized: number } {
  if (closes.length < window + 1) return { hv20: 0, hvAnnualized: 0 }

  // Use the most recent `window + 1` closes
  const recent = closes.slice(-(window + 1))
  const logReturns: number[] = []
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) {
      logReturns.push(Math.log(recent[i] / recent[i - 1]))
    }
  }

  if (logReturns.length < 2) return { hv20: 0, hvAnnualized: 0 }

  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1)
  const dailyVol = Math.sqrt(variance)
  const annualized = dailyVol * Math.sqrt(252)

  return {
    hv20: Math.round(dailyVol * 100 * 100) / 100,
    hvAnnualized: Math.round(annualized * 100 * 10) / 10,
  }
}

// ── Options Pendulum Score ──────────────────────────────────

export interface PendulumData {
  score: number          // 0-100 (0=buy options, 100=sell options)
  label: string          // "Buy Options" | "Neutral" | "Sell Options"
  ivRankSignal: number   // 0-100 sub-score
  ivHvSignal: number     // 0-100 sub-score
  skewSignal: number     // 0-100 sub-score
  yieldSignal: number    // 0-100 sub-score
  hv20: number
  hvAnnualized: number
}

/** Linear interpolation with clamping */
function lerp(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number {
  const t = Math.max(0, Math.min(1, (value - inLow) / (inHigh - inLow)))
  return outLow + t * (outHigh - outLow)
}

/**
 * Compute the Options Pendulum score.
 * 0 = strong buy signal (cheap options), 100 = strong sell signal (rich premiums).
 */
export function pendulumScore(params: {
  ivRank: number          // 0-100
  atmIV: number           // percentage (e.g. 30 for 30%)
  hvAnnualized: number    // percentage (e.g. 25 for 25%)
  putAvgIV: number        // percentage
  callAvgIV: number       // percentage
  avgPremiumYield: number // annualized % yield
  hv20: number
}): PendulumData {
  const { ivRank: ivR, atmIV, hvAnnualized, putAvgIV, callAvgIV, avgPremiumYield, hv20 } = params

  // 1. IV Rank (35%) — direct mapping, already 0-100
  const ivRankSignal = ivR

  // 2. IV vs HV (30%) — ratio of implied to realised volatility
  let ivHvSignal = 50
  if (hvAnnualized > 0) {
    const ratio = atmIV / hvAnnualized
    // ratio 0.8 → 0, ratio 1.0 → 50, ratio 1.5 → 100
    if (ratio <= 1.0) {
      ivHvSignal = lerp(ratio, 0.8, 1.0, 0, 50)
    } else {
      ivHvSignal = lerp(ratio, 1.0, 1.5, 50, 100)
    }
  }

  // 3. Put/Call Skew (15%) — high put skew = fear = rich put premiums
  let skewSignal = 50
  if (callAvgIV > 0) {
    const skewRatio = putAvgIV / callAvgIV
    // ratio 0.8 → 20, ratio 1.0 → 50, ratio 1.3 → 80
    skewSignal = lerp(skewRatio, 0.8, 1.3, 20, 80)
  }

  // 4. Premium Yield (20%) — higher yield = richer premiums
  // 0% → 0, 15% → 50, 40% → 100
  const yieldSignal = lerp(avgPremiumYield, 0, 40, 0, 100)

  // Weighted composite
  const score = Math.round(
    ivRankSignal * 0.35 +
    ivHvSignal * 0.30 +
    skewSignal * 0.15 +
    yieldSignal * 0.20
  )

  const clamped = Math.max(0, Math.min(100, score))
  const label = clamped <= 30 ? "Buy Options" : clamped >= 70 ? "Sell Options" : "Neutral"

  return {
    score: clamped,
    label,
    ivRankSignal: Math.round(ivRankSignal),
    ivHvSignal: Math.round(ivHvSignal),
    skewSignal: Math.round(skewSignal),
    yieldSignal: Math.round(yieldSignal),
    hv20,
    hvAnnualized,
  }
}

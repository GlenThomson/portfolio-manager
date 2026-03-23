/**
 * Entry Signal score (0-100) — "Is now a good time to buy?"
 *
 * High score = stock appears discounted/oversold = good entry.
 * Low score = stock appears overextended/overbought = wait for pullback.
 *
 * Uses mean-reversion technical signals only:
 *   RSI: 35% — oversold/overbought extremes
 *   Bollinger %B: 25% — price relative to statistical range
 *   Distance from SMA200: 25% — how far from long-term trend
 *   Pullback from recent high: 15% — magnitude of recent decline
 */

export interface EntryInput {
  rsi: number | null
  bollingerPercentB: number | null
  price: number
  sma200: number | null
  recentHigh52w: number | null // 52-week high
}

export interface EntryScoreResult {
  score: number
  details: Record<string, string>
}

function scoreRsiEntry(rsi: number | null): { points: number; detail: string } {
  if (rsi == null || isNaN(rsi)) return { points: 50, detail: "RSI data unavailable" }

  // Oversold = great entry, overbought = wait
  if (rsi <= 25) return { points: 95, detail: `RSI ${rsi.toFixed(0)} — deeply oversold, strong buy signal` }
  if (rsi <= 30) return { points: 85, detail: `RSI ${rsi.toFixed(0)} — oversold, good entry opportunity` }
  if (rsi <= 40) return { points: 70, detail: `RSI ${rsi.toFixed(0)} — approaching oversold` }
  if (rsi <= 60) return { points: 50, detail: `RSI ${rsi.toFixed(0)} — neutral, no timing signal` }
  if (rsi <= 70) return { points: 35, detail: `RSI ${rsi.toFixed(0)} — elevated, consider waiting` }
  if (rsi <= 80) return { points: 20, detail: `RSI ${rsi.toFixed(0)} — overbought, likely to pull back` }
  return { points: 10, detail: `RSI ${rsi.toFixed(0)} — extremely overbought, high pullback risk` }
}

function scoreBollingerEntry(percentB: number | null): { points: number; detail: string } {
  if (percentB == null || isNaN(percentB)) return { points: 50, detail: "Bollinger data unavailable" }

  // Near lower band = discounted, near upper = overextended
  if (percentB <= 0.05) return { points: 90, detail: `Bollinger %B ${percentB.toFixed(2)} — below lower band, deeply discounted` }
  if (percentB <= 0.2) return { points: 75, detail: `Bollinger %B ${percentB.toFixed(2)} — near lower band, attractive entry` }
  if (percentB <= 0.4) return { points: 60, detail: `Bollinger %B ${percentB.toFixed(2)} — lower half, reasonable entry` }
  if (percentB <= 0.6) return { points: 50, detail: `Bollinger %B ${percentB.toFixed(2)} — mid-range, no signal` }
  if (percentB <= 0.8) return { points: 35, detail: `Bollinger %B ${percentB.toFixed(2)} — upper half, not ideal entry` }
  if (percentB <= 0.95) return { points: 20, detail: `Bollinger %B ${percentB.toFixed(2)} — near upper band, overextended` }
  return { points: 10, detail: `Bollinger %B ${percentB.toFixed(2)} — above upper band, likely to revert` }
}

function scoreSma200Distance(price: number, sma200: number | null): { points: number; detail: string } {
  if (sma200 == null || isNaN(sma200) || sma200 <= 0) {
    return { points: 50, detail: "200 SMA data unavailable" }
  }

  const distancePct = ((price - sma200) / sma200) * 100

  // Well below 200 SMA = discounted (but confirm it's not a broken stock via investment grade)
  // Well above = overextended from long-term trend
  if (distancePct <= -20) return { points: 85, detail: `${distancePct.toFixed(0)}% below 200 SMA — deeply discounted from trend` }
  if (distancePct <= -10) return { points: 75, detail: `${distancePct.toFixed(0)}% below 200 SMA — discounted` }
  if (distancePct <= -3) return { points: 65, detail: `${distancePct.toFixed(0)}% below 200 SMA — slightly below trend` }
  if (distancePct <= 5) return { points: 50, detail: `${distancePct > 0 ? "+" : ""}${distancePct.toFixed(0)}% from 200 SMA — near trend` }
  if (distancePct <= 15) return { points: 40, detail: `+${distancePct.toFixed(0)}% above 200 SMA — above trend` }
  if (distancePct <= 30) return { points: 25, detail: `+${distancePct.toFixed(0)}% above 200 SMA — extended from trend` }
  return { points: 15, detail: `+${distancePct.toFixed(0)}% above 200 SMA — severely overextended` }
}

function scorePullback(price: number, high52w: number | null): { points: number; detail: string } {
  if (high52w == null || isNaN(high52w) || high52w <= 0) {
    return { points: 50, detail: "52-week high data unavailable" }
  }

  const pullbackPct = ((high52w - price) / high52w) * 100

  // Bigger pullback from high = better entry (mean reversion)
  if (pullbackPct >= 40) return { points: 85, detail: `${pullbackPct.toFixed(0)}% off 52-week high — deep pullback, potential value` }
  if (pullbackPct >= 25) return { points: 75, detail: `${pullbackPct.toFixed(0)}% off 52-week high — significant pullback` }
  if (pullbackPct >= 15) return { points: 65, detail: `${pullbackPct.toFixed(0)}% off 52-week high — moderate pullback` }
  if (pullbackPct >= 5) return { points: 50, detail: `${pullbackPct.toFixed(0)}% off 52-week high — mild pullback` }
  return { points: 30, detail: `${pullbackPct.toFixed(0)}% off 52-week high — near highs, limited upside entry` }
}

export function computeEntryScore(input: EntryInput): EntryScoreResult {
  const rsiResult = scoreRsiEntry(input.rsi)
  const bbResult = scoreBollingerEntry(input.bollingerPercentB)
  const smaResult = scoreSma200Distance(input.price, input.sma200)
  const pullbackResult = scorePullback(input.price, input.recentHigh52w)

  const score = Math.round(
    rsiResult.points * 0.35 +
    bbResult.points * 0.25 +
    smaResult.points * 0.25 +
    pullbackResult.points * 0.15
  )

  return {
    score: Math.max(0, Math.min(100, score)),
    details: {
      rsi: rsiResult.detail,
      bollinger: bbResult.detail,
      sma200Distance: smaResult.detail,
      pullback: pullbackResult.detail,
    },
  }
}

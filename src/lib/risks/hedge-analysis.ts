/**
 * Hedge analysis — for each "hedge ticker" attached to a risk monitor,
 * compute entry attractiveness based on technicals (RSI, recent drawdown,
 * distance from 52-week high/low). High attractiveness + elevated risk
 * score = good time to consider a hedge trade (puts, vol, etc.).
 *
 * Pure function — takes context, returns structured signals. Caller
 * decides what to persist or alert on.
 */

import { getQuote, getChart } from "@/lib/market/yahoo"
import { computeRSI } from "@/lib/market/technicals"

export interface HedgeSignal {
  symbol: string
  currentPrice: number
  rsi14: number | null         // 14-day RSI; <30 = oversold, >70 = overbought
  pct5d: number                // 5-day return %
  pct30d: number               // 30-day return %
  pctFrom52High: number        // % off 52w high (negative = below high)
  pctFrom52Low: number         // % above 52w low
  attractiveness: number       // 0-100: higher = better entry conditions for protective trades
  signals: string[]            // human-readable reasons
}

const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70

export async function analyzeHedgeTicker(symbol: string): Promise<HedgeSignal | null> {
  try {
    const quote = await getQuote(symbol)
    if (!quote || !quote.regularMarketPrice) return null

    // Fetch ~90 days for RSI computation
    const startDate = new Date(Date.now() - 100 * 86400_000).toISOString().slice(0, 10)
    const bars = await getChart(symbol, startDate, "1d").catch(() => [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const closes = Array.isArray(bars) ? (bars as any[]).map((b) => b.close).filter((c: number) => c > 0) : []

    let rsi14: number | null = null
    if (closes.length >= 30) {
      const rsiSeries = computeRSI(closes, 14)
      const last = rsiSeries[rsiSeries.length - 1]
      if (Number.isFinite(last)) rsi14 = last
    }

    const current = quote.regularMarketPrice
    const close5 = closes.length >= 6 ? closes[closes.length - 6] : current
    const close30 = closes.length >= 31 ? closes[closes.length - 31] : current
    const pct5d = ((current - close5) / close5) * 100
    const pct30d = ((current - close30) / close30) * 100

    const high52 = quote.fiftyTwoWeekHigh || current
    const low52 = quote.fiftyTwoWeekLow || current
    const pctFrom52High = ((current - high52) / high52) * 100
    const pctFrom52Low = ((current - low52) / low52) * 100

    // Attractiveness score: combine multiple oversold signals.
    // High score = good entry for protective/contrarian trades.
    const signals: string[] = []
    let score = 0

    // RSI oversold (heavy weight)
    if (rsi14 != null) {
      if (rsi14 <= 25) { score += 35; signals.push(`RSI ${rsi14.toFixed(0)} (deeply oversold)`) }
      else if (rsi14 <= 30) { score += 25; signals.push(`RSI ${rsi14.toFixed(0)} (oversold)`) }
      else if (rsi14 <= 40) { score += 10; signals.push(`RSI ${rsi14.toFixed(0)} (weak)`) }
      else if (rsi14 >= 70) { signals.push(`RSI ${rsi14.toFixed(0)} (overbought — wait for pullback)`) }
    }

    // Recent drawdown
    if (pct5d <= -10) { score += 25; signals.push(`down ${pct5d.toFixed(1)}% in 5 days`) }
    else if (pct5d <= -5) { score += 15; signals.push(`down ${pct5d.toFixed(1)}% in 5 days`) }
    else if (pct5d <= -3) { score += 5 }

    // Distance from 52w high — bigger drawdown = better entry
    if (pctFrom52High <= -25) { score += 25; signals.push(`${pctFrom52High.toFixed(0)}% off 52w high`) }
    else if (pctFrom52High <= -15) { score += 15; signals.push(`${pctFrom52High.toFixed(0)}% off 52w high`) }
    else if (pctFrom52High <= -8) { score += 8 }

    // Bonus: 30d momentum negative
    if (pct30d <= -10) { score += 10; signals.push(`down ${pct30d.toFixed(1)}% in 30 days`) }

    // Cap and clamp
    score = Math.max(0, Math.min(100, score))

    // If no signals, add a default note
    if (signals.length === 0) signals.push("No entry signals — looks normal.")

    return {
      symbol,
      currentPrice: current,
      rsi14,
      pct5d,
      pct30d,
      pctFrom52High,
      pctFrom52Low,
      attractiveness: score,
      signals,
    }
  } catch {
    return null
  }
}

export async function analyzeHedgeTickers(symbols: string[]): Promise<HedgeSignal[]> {
  if (symbols.length === 0) return []
  const results = await Promise.all(symbols.map((s) => analyzeHedgeTicker(s)))
  return results.filter((r): r is HedgeSignal => r != null)
}

/**
 * Combined signal: this is a "good time to hedge" if BOTH the risk score
 * is elevated AND a hedge ticker shows favorable entry conditions.
 *
 * Returns the symbols flagged as alignment opportunities.
 */
export function findHedgeAlignments(
  riskScore: number,
  hedges: HedgeSignal[],
  opts: { riskThreshold?: number; hedgeThreshold?: number } = {},
): { symbol: string; reason: string; attractiveness: number }[] {
  const riskThreshold = opts.riskThreshold ?? 50
  const hedgeThreshold = opts.hedgeThreshold ?? 40

  if (riskScore < riskThreshold) return []

  return hedges
    .filter((h) => h.attractiveness >= hedgeThreshold)
    .map((h) => ({
      symbol: h.symbol,
      reason: h.signals.join("; "),
      attractiveness: h.attractiveness,
    }))
    .sort((a, b) => b.attractiveness - a.attractiveness)
}

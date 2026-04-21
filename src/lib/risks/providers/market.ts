import { getChart } from "@/lib/market/yahoo"
import type { MonitorContext, ProviderResult } from "./types"

interface TickerSignal {
  symbol: string
  currentPrice: number
  pct5d: number
  pct30d: number
  hv20: number        // 20d annualised realised vol (%)
  hvBaseline: number  // 60d mean of 20d HV (%)
  hvZscore: number    // current vs baseline
  signalScore: number // 0-100 contribution from this ticker
  note: string
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function rollingHv(closes: number[], window = 20): number[] {
  // Returns an array of 20d annualised HV values for each index where window is available
  const out: number[] = []
  if (closes.length < window + 1) return out
  const logReturns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const cur = closes[i]
    logReturns.push(prev > 0 && cur > 0 ? Math.log(cur / prev) : 0)
  }
  for (let i = window; i <= logReturns.length; i++) {
    const slice = logReturns.slice(i - window, i)
    const dailyVol = stdev(slice)
    out.push(dailyVol * Math.sqrt(252) * 100)
  }
  return out
}

/**
 * Compute market-based risk signal from linked tickers.
 * For each ticker: is 20d vol elevated vs its own 60d baseline? Are recent
 * returns unusually negative? Combine into a 0-100 score.
 *
 * Higher score = markets are stressed → risk is elevated.
 */
export async function runMarketProvider(ctx: MonitorContext): Promise<ProviderResult> {
  if (ctx.linkedTickers.length === 0) {
    return {
      key: "market",
      score: 0,
      weight: 0,
      summary: "No linked tickers — market signal disabled.",
      data: { signals: [] },
    }
  }

  // ~180 days of daily data — enough for 20d HV + 60d baseline of HV
  const startDate = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10)

  const signals: TickerSignal[] = []
  for (const sym of ctx.linkedTickers) {
    try {
      const bars = await getChart(sym, startDate, "1d")
      if (!Array.isArray(bars) || bars.length < 30) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const closes = (bars as any[]).map((b) => b.close).filter((c: number) => c > 0)
      if (closes.length < 30) continue

      const current = closes[closes.length - 1]
      const p5 = closes[closes.length - 6] ?? current
      const p30 = closes[closes.length - 31] ?? current
      const pct5d = ((current - p5) / p5) * 100
      const pct30d = ((current - p30) / p30) * 100

      const hvSeries = rollingHv(closes, 20)
      const hv20 = hvSeries[hvSeries.length - 1] ?? 0
      // Baseline = mean of prior 60 HV values (excluding last)
      const baselineSlice = hvSeries.slice(-61, -1)
      const hvBaseline = baselineSlice.length > 0
        ? baselineSlice.reduce((s, v) => s + v, 0) / baselineSlice.length
        : hv20
      const hvStd = stdev(baselineSlice) || 1
      const hvZscore = (hv20 - hvBaseline) / hvStd

      // Per-ticker score: elevated vol OR large drawdown adds risk
      const volComponent = Math.max(0, Math.min(100, 50 + hvZscore * 15))
      const drawdownComponent = Math.max(0, Math.min(100, -pct5d * 5 + 50 - 50)) // 0 if positive, scales up if -10% = 50
      const signalScore = Math.round(Math.max(volComponent, drawdownComponent))

      const note =
        hvZscore > 1.5
          ? `vol spiking (${hv20.toFixed(0)}% vs ${hvBaseline.toFixed(0)}% baseline)`
          : pct5d < -5
            ? `down ${pct5d.toFixed(1)}% in 5d`
            : "quiet"

      signals.push({
        symbol: sym,
        currentPrice: current,
        pct5d,
        pct30d,
        hv20,
        hvBaseline,
        hvZscore,
        signalScore,
        note,
      })
    } catch {
      // skip this ticker
    }
  }

  if (signals.length === 0) {
    return {
      key: "market",
      score: 0,
      weight: 0,
      summary: "No market data retrieved for linked tickers.",
      data: { signals: [] },
    }
  }

  // Composite: max of individual signals (any one stressed ticker → risk elevated)
  // but blended with average so no single outlier dominates.
  const max = Math.max(...signals.map((s) => s.signalScore))
  const avg = signals.reduce((s, v) => s + v.signalScore, 0) / signals.length
  const score = Math.round(max * 0.6 + avg * 0.4)

  const stressed = signals.filter((s) => s.signalScore >= 60).map((s) => s.symbol)
  const summary = stressed.length > 0
    ? `Elevated stress in ${stressed.join(", ")}.`
    : signals.some((s) => s.hvZscore > 0.8)
      ? `Vol creeping up in ${signals.filter((s) => s.hvZscore > 0.8).map((s) => s.symbol).join(", ")}.`
      : "Linked tickers look quiet relative to their own baselines."

  return {
    key: "market",
    score,
    weight: 0.20,
    summary,
    data: { signals },
  }
}

/**
 * Market regime detection using macro indicators.
 *
 * Classifies the current environment into one of four regimes:
 *   1. Risk-On (expansion) — growth, low vol, steepening curve
 *   2. Risk-Off (contraction) — rising unemployment, inverted curve, high vol
 *   3. Inflation — rising CPI, rising rates, commodities outperform
 *   4. Transition — mixed signals, regime change in progress
 *
 * Each regime implies different sector/factor tilts.
 */

import { getMacroSnapshot, isFredConfigured, type MacroSnapshot } from "@/lib/market/fred"
import { getPutCallSnapshot, type PutCallSnapshot } from "@/lib/market/cboe"

export type MarketRegime = "risk_on" | "risk_off" | "inflation" | "transition"

export interface RegimeSignal {
  indicator: string
  value: number | string | null
  signal: "risk_on" | "risk_off" | "inflation" | "neutral"
  detail: string
}

export interface RegimeResult {
  regime: MarketRegime
  confidence: "high" | "medium" | "low"
  signals: RegimeSignal[]
  summary: string
  implications: {
    favoredSectors: string[]
    unfavoredSectors: string[]
    favoredFactors: string[]
    positioning: string
  }
}

function classifyYieldCurve(spread: number | null): RegimeSignal {
  if (spread == null) {
    return { indicator: "Yield Curve (10Y-2Y)", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  if (spread < -0.5) {
    return {
      indicator: "Yield Curve (10Y-2Y)",
      value: `${spread.toFixed(2)}%`,
      signal: "risk_off",
      detail: `Deeply inverted (${spread.toFixed(2)}%) — recession signal, historically precedes downturns by 6-18 months`,
    }
  }
  if (spread < 0) {
    return {
      indicator: "Yield Curve (10Y-2Y)",
      value: `${spread.toFixed(2)}%`,
      signal: "risk_off",
      detail: `Inverted (${spread.toFixed(2)}%) — caution, recession risk elevated`,
    }
  }
  if (spread < 0.5) {
    return {
      indicator: "Yield Curve (10Y-2Y)",
      value: `${spread.toFixed(2)}%`,
      signal: "neutral",
      detail: `Flat curve (${spread.toFixed(2)}%) — transitional, watch for direction`,
    }
  }
  return {
    indicator: "Yield Curve (10Y-2Y)",
    value: `${spread.toFixed(2)}%`,
    signal: "risk_on",
    detail: `Normal/steep curve (${spread.toFixed(2)}%) — economy expanding, banks lending`,
  }
}

function classifyVIX(vix: number | null): RegimeSignal {
  if (vix == null) {
    return { indicator: "VIX", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  if (vix >= 30) {
    return {
      indicator: "VIX",
      value: vix.toFixed(1),
      signal: "risk_off",
      detail: `VIX at ${vix.toFixed(1)} — high fear/panic, market stress`,
    }
  }
  if (vix >= 20) {
    return {
      indicator: "VIX",
      value: vix.toFixed(1),
      signal: "neutral",
      detail: `VIX at ${vix.toFixed(1)} — elevated uncertainty`,
    }
  }
  if (vix >= 15) {
    return {
      indicator: "VIX",
      value: vix.toFixed(1),
      signal: "risk_on",
      detail: `VIX at ${vix.toFixed(1)} — normal conditions`,
    }
  }
  return {
    indicator: "VIX",
    value: vix.toFixed(1),
    signal: "risk_on",
    detail: `VIX at ${vix.toFixed(1)} — very low volatility, complacent (contrarian caution)`,
  }
}

function classifyUnemployment(
  observations: { date: string; value: number }[] | null
): RegimeSignal {
  if (!observations || observations.length < 3) {
    return { indicator: "Unemployment", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  const latest = observations[observations.length - 1].value
  const prior = observations[observations.length - 3].value // 3 months ago
  const trend = latest - prior

  if (trend > 0.5) {
    return {
      indicator: "Unemployment",
      value: `${latest.toFixed(1)}% (↑${trend.toFixed(1)})`,
      signal: "risk_off",
      detail: `Unemployment rising to ${latest.toFixed(1)}% (+${trend.toFixed(1)} over 3 months) — labor market weakening`,
    }
  }
  if (latest > 5.5) {
    return {
      indicator: "Unemployment",
      value: `${latest.toFixed(1)}%`,
      signal: "risk_off",
      detail: `Unemployment elevated at ${latest.toFixed(1)}% — economic weakness`,
    }
  }
  if (trend < -0.3) {
    return {
      indicator: "Unemployment",
      value: `${latest.toFixed(1)}% (↓${Math.abs(trend).toFixed(1)})`,
      signal: "risk_on",
      detail: `Unemployment falling to ${latest.toFixed(1)}% (−${Math.abs(trend).toFixed(1)} over 3 months) — labor market strengthening`,
    }
  }
  return {
    indicator: "Unemployment",
    value: `${latest.toFixed(1)}%`,
    signal: latest <= 4.0 ? "risk_on" : "neutral",
    detail: `Unemployment at ${latest.toFixed(1)}% — ${latest <= 4.0 ? "strong labor market" : "moderate"}`,
  }
}

function classifyCPI(
  observations: { date: string; value: number }[] | null
): RegimeSignal {
  if (!observations || observations.length < 12) {
    return { indicator: "CPI (Inflation)", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  // Compute YoY inflation from CPI index values
  const latest = observations[observations.length - 1].value
  const yearAgo = observations[0].value
  const yoyInflation = yearAgo > 0 ? ((latest - yearAgo) / yearAgo) * 100 : 0

  if (yoyInflation > 5) {
    return {
      indicator: "CPI (Inflation)",
      value: `${yoyInflation.toFixed(1)}% YoY`,
      signal: "inflation",
      detail: `Inflation high at ${yoyInflation.toFixed(1)}% YoY — erodes purchasing power, favors real assets`,
    }
  }
  if (yoyInflation > 3.5) {
    return {
      indicator: "CPI (Inflation)",
      value: `${yoyInflation.toFixed(1)}% YoY`,
      signal: "inflation",
      detail: `Inflation above target at ${yoyInflation.toFixed(1)}% YoY — may trigger rate hikes`,
    }
  }
  if (yoyInflation < 1) {
    return {
      indicator: "CPI (Inflation)",
      value: `${yoyInflation.toFixed(1)}% YoY`,
      signal: "risk_off",
      detail: `Very low inflation at ${yoyInflation.toFixed(1)}% YoY — deflation risk, possible economic weakness`,
    }
  }
  return {
    indicator: "CPI (Inflation)",
    value: `${yoyInflation.toFixed(1)}% YoY`,
    signal: "neutral",
    detail: `Inflation at ${yoyInflation.toFixed(1)}% YoY — near target, stable`,
  }
}

function classifyFedRate(rate: number | null): RegimeSignal {
  if (rate == null) {
    return { indicator: "Fed Funds Rate", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  if (rate >= 5) {
    return {
      indicator: "Fed Funds Rate",
      value: `${rate.toFixed(2)}%`,
      signal: "risk_off",
      detail: `Fed funds at ${rate.toFixed(2)}% — restrictive, headwind for equities and housing`,
    }
  }
  if (rate >= 3) {
    return {
      indicator: "Fed Funds Rate",
      value: `${rate.toFixed(2)}%`,
      signal: "neutral",
      detail: `Fed funds at ${rate.toFixed(2)}% — moderately tight`,
    }
  }
  if (rate >= 1) {
    return {
      indicator: "Fed Funds Rate",
      value: `${rate.toFixed(2)}%`,
      signal: "risk_on",
      detail: `Fed funds at ${rate.toFixed(2)}% — accommodative`,
    }
  }
  return {
    indicator: "Fed Funds Rate",
    value: `${rate.toFixed(2)}%`,
    signal: "risk_on",
    detail: `Fed funds at ${rate.toFixed(2)}% — very accommodative, supports risk assets`,
  }
}

function classifyPutCall(putCall: PutCallSnapshot | null): RegimeSignal {
  if (!putCall?.total?.latestRatio) {
    return { indicator: "Put/Call Ratio", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  const ratio = putCall.total.latestRatio
  const avg = putCall.total.avgRatio30d

  if (ratio >= 1.2) {
    return {
      indicator: "Put/Call Ratio",
      value: `${ratio.toFixed(2)} (30d avg: ${avg?.toFixed(2) ?? "N/A"})`,
      signal: "risk_off",
      detail: `Put/call at ${ratio.toFixed(2)} — extreme bearish positioning (contrarian bullish)`,
    }
  }
  if (ratio >= 1.0) {
    return {
      indicator: "Put/Call Ratio",
      value: `${ratio.toFixed(2)}`,
      signal: "risk_off",
      detail: `Put/call at ${ratio.toFixed(2)} — bearish sentiment`,
    }
  }
  if (ratio <= 0.5) {
    return {
      indicator: "Put/Call Ratio",
      value: `${ratio.toFixed(2)}`,
      signal: "risk_on",
      detail: `Put/call at ${ratio.toFixed(2)} — extreme bullish/complacent (contrarian bearish)`,
    }
  }
  if (ratio <= 0.7) {
    return {
      indicator: "Put/Call Ratio",
      value: `${ratio.toFixed(2)}`,
      signal: "risk_on",
      detail: `Put/call at ${ratio.toFixed(2)} — bullish sentiment`,
    }
  }
  return {
    indicator: "Put/Call Ratio",
    value: `${ratio.toFixed(2)}`,
    signal: "neutral",
    detail: `Put/call at ${ratio.toFixed(2)} — neutral range`,
  }
}

function classifyConsumerSentiment(value: number | null): RegimeSignal {
  if (value == null) {
    return { indicator: "Consumer Sentiment", value: null, signal: "neutral", detail: "Data unavailable" }
  }

  if (value >= 80) {
    return {
      indicator: "Consumer Sentiment",
      value: value.toFixed(1),
      signal: "risk_on",
      detail: `Consumer sentiment at ${value.toFixed(1)} — optimistic, supports spending`,
    }
  }
  if (value >= 60) {
    return {
      indicator: "Consumer Sentiment",
      value: value.toFixed(1),
      signal: "neutral",
      detail: `Consumer sentiment at ${value.toFixed(1)} — moderate`,
    }
  }
  return {
    indicator: "Consumer Sentiment",
    value: value.toFixed(1),
    signal: "risk_off",
    detail: `Consumer sentiment at ${value.toFixed(1)} — pessimistic, headwind for discretionary spending`,
  }
}

/**
 * Determine the overall market regime from signal counts.
 */
function determineRegime(signals: RegimeSignal[]): {
  regime: MarketRegime
  confidence: "high" | "medium" | "low"
} {
  const counts = { risk_on: 0, risk_off: 0, inflation: 0, neutral: 0 }
  const validSignals = signals.filter(s => s.value != null)

  for (const s of validSignals) {
    counts[s.signal]++
  }

  const total = validSignals.length
  if (total === 0) return { regime: "transition", confidence: "low" }

  // Check for inflation regime first
  if (counts.inflation >= 2) {
    const infPct = counts.inflation / total
    return {
      regime: "inflation",
      confidence: infPct >= 0.4 ? "high" : "medium",
    }
  }

  // Risk-on vs risk-off
  const riskOnPct = counts.risk_on / total
  const riskOffPct = counts.risk_off / total

  if (riskOnPct >= 0.5) {
    return {
      regime: "risk_on",
      confidence: riskOnPct >= 0.7 ? "high" : "medium",
    }
  }
  if (riskOffPct >= 0.5) {
    return {
      regime: "risk_off",
      confidence: riskOffPct >= 0.7 ? "high" : "medium",
    }
  }

  return { regime: "transition", confidence: "low" }
}

function getImplications(regime: MarketRegime): RegimeResult["implications"] {
  switch (regime) {
    case "risk_on":
      return {
        favoredSectors: ["Technology", "Consumer Discretionary", "Financials", "Industrials"],
        unfavoredSectors: ["Utilities", "Consumer Staples"],
        favoredFactors: ["Growth", "Momentum", "Small-cap"],
        positioning: "Favor equities over bonds. Growth and cyclical sectors tend to outperform. Consider higher beta exposure.",
      }
    case "risk_off":
      return {
        favoredSectors: ["Utilities", "Consumer Staples", "Healthcare", "Real Estate"],
        unfavoredSectors: ["Technology", "Consumer Discretionary", "Financials"],
        favoredFactors: ["Quality", "Low Volatility", "Dividend Yield", "Large-cap"],
        positioning: "Favor defensive sectors and quality stocks. Consider reducing equity exposure. Bonds may outperform. Cash is a valid position.",
      }
    case "inflation":
      return {
        favoredSectors: ["Energy", "Materials", "Real Estate", "Financials"],
        unfavoredSectors: ["Technology", "Utilities", "Consumer Discretionary"],
        favoredFactors: ["Value", "Commodity exposure", "Short duration"],
        positioning: "Favor real assets and pricing-power companies. Avoid long-duration growth stocks. TIPS and commodities may outperform nominal bonds.",
      }
    case "transition":
      return {
        favoredSectors: ["Healthcare", "Consumer Staples"],
        unfavoredSectors: [],
        favoredFactors: ["Quality", "Diversification"],
        positioning: "Mixed signals — maintain balanced allocation. Focus on quality companies with strong balance sheets. Avoid aggressive bets until regime clarifies.",
      }
  }
}

const REGIME_LABELS: Record<MarketRegime, string> = {
  risk_on: "Risk-On (Expansion)",
  risk_off: "Risk-Off (Contraction)",
  inflation: "Inflationary",
  transition: "Transitional (Mixed Signals)",
}

/**
 * Detect the current market regime from macro indicators.
 */
export async function detectMarketRegime(): Promise<RegimeResult> {
  const [macroResult, putCallResult] = await Promise.allSettled([
    isFredConfigured() ? getMacroSnapshot() : Promise.resolve(null),
    getPutCallSnapshot(),
  ])

  const macro: MacroSnapshot | null =
    macroResult.status === "fulfilled" ? macroResult.value : null
  const putCall: PutCallSnapshot | null =
    putCallResult.status === "fulfilled" ? putCallResult.value : null

  // Classify each indicator
  const signals: RegimeSignal[] = [
    classifyYieldCurve(macro?.yieldCurveSpread?.latestValue ?? null),
    classifyVIX(macro?.vix?.latestValue ?? null),
    classifyUnemployment(macro?.unemployment?.observations ?? null),
    classifyCPI(macro?.cpi?.observations ?? null),
    classifyFedRate(macro?.fedFundsRate?.latestValue ?? null),
    classifyConsumerSentiment(macro?.consumerSentiment?.latestValue ?? null),
    classifyPutCall(putCall),
  ]

  const { regime, confidence } = determineRegime(signals)
  const implications = getImplications(regime)

  const validCount = signals.filter(s => s.value != null).length
  const summary = validCount === 0
    ? "Unable to determine market regime — no macro data available. Configure FRED_API_KEY for full analysis."
    : `Market regime: ${REGIME_LABELS[regime]} (${confidence} confidence). Based on ${validCount} macro indicators.`

  return {
    regime,
    confidence,
    signals,
    summary,
    implications,
  }
}

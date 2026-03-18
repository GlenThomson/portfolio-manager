/**
 * Stock Scoring Engine — main entry point.
 * Fetches all needed data in parallel and computes a multi-factor score.
 *
 * Factors: Momentum (30%), Fundamental (30%), Technical (20%),
 *          Sentiment (10%), Risk (10%)
 */

import YahooFinance from "yahoo-finance2"
import { getChart } from "@/lib/market/yahoo"
import {
  computeRSI,
  computeMACD,
  computeSMA,
  computeBollingerBands,
  computeATR,
} from "@/lib/market/technicals"
import { getStockSentiment } from "@/lib/market/reddit"
import { getFearGreedIndex } from "@/lib/market/fear-greed"
import {
  getCompanyNews,
  getInsiderTransactions,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"
import { getNews as getYahooNews } from "@/lib/market/yahoo"

import { computeTechnicalScore, type TechnicalInput } from "./technical-score"
import { computeFundamentalScore, type FundamentalInput } from "./fundamental-score"
import { computeSentimentScore, classifyHeadline, type SentimentInput } from "./sentiment-score"
import { computeMomentumScore, type MomentumInput } from "./momentum-score"
import { computeRiskScore, computeMaxDrawdown, type RiskInput } from "./risk-score"
import { computeCompositeScore, type StockScore, type SignalFreshness } from "./composite-score"

export type { StockScore } from "./composite-score"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] })

// ── Cache ──────────────────────────────────────────────────
const scoreCache = new Map<string, { data: StockScore; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * Get a comprehensive multi-factor score for a stock symbol.
 */
export async function getStockScore(symbol: string): Promise<StockScore> {
  const upper = symbol.toUpperCase()

  // Check cache
  const cached = scoreCache.get(upper)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  // Fetch all data in parallel
  const [chartData, fundamentalsResult, sentimentResult, fearGreedResult, newsResult, insiderResult] =
    await Promise.allSettled([
      fetchChartData(upper),
      fetchFundamentals(upper),
      getStockSentiment(upper),
      getFearGreedIndex(),
      fetchNews(upper),
      fetchInsiderData(upper),
    ])

  // ── Extract chart data ──
  const candles: Array<{ close: number; high: number; low: number; volume: number }> =
    chartData.status === "fulfilled" ? chartData.value : []
  const closes = candles.map((c) => c.close)
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const volumes = candles.map((c) => c.volume)
  const lastIdx = closes.length - 1
  const currentPrice = closes[lastIdx] ?? 0

  // ── Technical indicators ──
  let technicalInput: TechnicalInput = {
    rsi: null,
    macdHistogram: null,
    macdHistogramPrev: null,
    bollingerPercentB: null,
    price: currentPrice,
    sma50: null,
    sma200: null,
    volumeRatio: null,
  }

  if (closes.length >= 50) {
    const rsiValues = computeRSI(closes, 14)
    const macdResult = computeMACD(closes)
    const sma50 = computeSMA(closes, 50)
    const sma200 = computeSMA(closes, 200)
    const bb = computeBollingerBands(closes, 20, 2)

    const bbUpper = bb.upper[lastIdx]
    const bbLower = bb.lower[lastIdx]
    const percentB =
      !isNaN(bbUpper) && !isNaN(bbLower) && bbUpper !== bbLower
        ? (currentPrice - bbLower) / (bbUpper - bbLower)
        : NaN

    const recentVolumes = volumes.slice(Math.max(0, lastIdx - 19), lastIdx + 1)
    const avgVolume =
      recentVolumes.length > 0
        ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
        : 0
    const volumeRatio = avgVolume > 0 ? volumes[lastIdx] / avgVolume : NaN

    technicalInput = {
      rsi: rsiValues[lastIdx],
      macdHistogram: macdResult.histogram[lastIdx],
      macdHistogramPrev: lastIdx > 0 ? macdResult.histogram[lastIdx - 1] : null,
      bollingerPercentB: percentB,
      price: currentPrice,
      sma50: sma50[lastIdx],
      sma200: sma200[lastIdx],
      volumeRatio,
    }
  }

  const technicalResult = computeTechnicalScore(technicalInput)

  // ── Fundamental data ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fundData: any =
    fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : {}

  const fundamentalInput: FundamentalInput = {
    forwardPE: fundData.forwardPE ?? null,
    revenueGrowth: fundData.revenueGrowth ?? null,
    profitMargin: fundData.profitMargins ?? null,
    returnOnEquity: fundData.returnOnEquity ?? null,
    epsGrowth: fundData.earningsGrowth ?? null,
    recommendationKey: fundData.recommendationKey ?? null,
  }

  const fundamentalResult = computeFundamentalScore(fundamentalInput)

  // ── Sentiment ──
  const reddit =
    sentimentResult.status === "fulfilled" ? sentimentResult.value : null
  const fearGreed =
    fearGreedResult.status === "fulfilled" ? fearGreedResult.value : null
  const headlines: string[] =
    newsResult.status === "fulfilled" ? newsResult.value : []

  // Insider data
  const insiderTxns =
    insiderResult.status === "fulfilled" ? insiderResult.value : null

  // Classify headlines
  let newsPositive = 0
  let newsNegative = 0
  let newsNeutral = 0
  for (const h of headlines) {
    const cls = classifyHeadline(h)
    if (cls === "positive") newsPositive++
    else if (cls === "negative") newsNegative++
    else newsNeutral++
  }

  // Compute analyst dispersion from recommendation trend
  const recTrend = fundData.recommendationTrend ?? null
  let analystDispersion: number | null = null
  if (recTrend) {
    const counts = [
      recTrend.strongBuy ?? 0,
      recTrend.buy ?? 0,
      recTrend.hold ?? 0,
      recTrend.sell ?? 0,
      recTrend.strongSell ?? 0,
    ]
    const total = counts.reduce((a: number, b: number) => a + b, 0)
    if (total > 0) {
      // Weighted mean and std dev of recommendation distribution (1=strong sell, 5=strong buy)
      const weights = [5, 4, 3, 2, 1]
      const mean = counts.reduce((sum: number, c: number, i: number) => sum + c * weights[i], 0) / total
      const variance = counts.reduce(
        (sum: number, c: number, i: number) => sum + c * Math.pow(weights[i] - mean, 2),
        0
      ) / total
      analystDispersion = Math.sqrt(variance)
    }
  }

  // Process insider transactions
  let insiderNetBuys: number | null = null
  let insiderCsuiteBuys: number | null = null
  if (insiderTxns != null) {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const recentTxns = insiderTxns.filter(
      (t) => new Date(t.transactionDate) >= ninetyDaysAgo
    )

    // P = purchase, S = sale
    const buys = recentTxns.filter((t) => t.transactionCode === "P")
    const sells = recentTxns.filter((t) => t.transactionCode === "S")
    insiderNetBuys = buys.length - sells.length

    // C-suite detection: names containing CEO, CFO, COO, CTO, President, Chairman, Director
    const cSuitePattern = /\b(ceo|cfo|coo|cto|president|chairman|chief)\b/i
    insiderCsuiteBuys = buys.filter((t) => cSuitePattern.test(t.name)).length
  }

  const sentimentInput: SentimentInput = {
    newsPositive,
    newsNegative,
    newsNeutral,
    wsbSentiment: reddit?.wsbSentiment ?? null,
    wsbSentimentScore: reddit?.wsbSentimentScore ?? null,
    redditMentions: reddit?.redditMentions ?? null,
    fearGreedScore: fearGreed?.score ?? null,
    recommendationKey: fundData.recommendationKey ?? null,
    analystDispersion,
    targetMeanPrice: fundData.targetMeanPrice ?? null,
    currentPrice: currentPrice > 0 ? currentPrice : null,
    insiderNetBuys,
    insiderCsuitebuys: insiderCsuiteBuys,
  }

  const sentimentScoreResult = computeSentimentScore(sentimentInput)

  // ── Momentum (with EPS revisions) ──
  const price3mAgo = closes.length >= 63 ? closes[closes.length - 63] : null
  const price6mAgo = closes.length >= 126 ? closes[closes.length - 126] : null
  const price12mAgo = closes.length >= 252 ? closes[closes.length - 252] : null

  const momentumInput: MomentumInput = {
    currentPrice,
    price3mAgo,
    price6mAgo,
    price12mAgo,
    epsRevisionsUp30d: fundData.epsRevisionsUp30d ?? null,
    epsRevisionsDown30d: fundData.epsRevisionsDown30d ?? null,
    epsTrendCurrent: fundData.epsTrendCurrent ?? null,
    epsTrend90dAgo: fundData.epsTrend90dAgo ?? null,
  }

  const momentumResult = computeMomentumScore(momentumInput)

  // ── Risk ──
  let atrPercent: number | null = null
  if (highs.length >= 14 && lows.length >= 14 && closes.length >= 14) {
    const atrValues = computeATR(highs, lows, closes, 14)
    const lastAtr = atrValues[atrValues.length - 1]
    if (lastAtr != null && !isNaN(lastAtr) && currentPrice > 0) {
      atrPercent = (lastAtr / currentPrice) * 100
    }
  }

  const maxDrawdownPct = closes.length >= 20 ? computeMaxDrawdown(closes) : null

  const riskInput: RiskInput = {
    beta: fundData.beta ?? null,
    atrPercent,
    maxDrawdownPercent: maxDrawdownPct,
  }

  const riskResult = computeRiskScore(riskInput)

  // ── Signal freshness ──
  const signalFreshness: Record<string, SignalFreshness> = {
    technical: closes.length >= 50 ? "fresh" : "stale",
    fundamental: fundData.forwardPE != null ? "fresh" : fundData.revenueGrowth != null ? "aging" : "stale",
    sentiment: headlines.length > 0 ? "fresh" : fearGreed != null ? "aging" : "stale",
    momentum: fundData.epsTrendCurrent != null ? "fresh" : price3mAgo != null ? "aging" : "stale",
    risk: atrPercent != null ? "fresh" : fundData.beta != null ? "aging" : "stale",
  }

  // ── Combine all details ──
  const allDetails: Record<string, string> = {}
  for (const [k, v] of Object.entries(technicalResult.details)) {
    allDetails[`tech_${k}`] = v
  }
  for (const [k, v] of Object.entries(fundamentalResult.details)) {
    allDetails[`fund_${k}`] = v
  }
  for (const [k, v] of Object.entries(sentimentScoreResult.details)) {
    allDetails[`sent_${k}`] = v
  }
  for (const [k, v] of Object.entries(momentumResult.details)) {
    allDetails[`mom_${k}`] = v
  }
  for (const [k, v] of Object.entries(riskResult.details)) {
    allDetails[`risk_${k}`] = v
  }

  // ── Composite ──
  const score = computeCompositeScore({
    technicalScore: technicalResult.score,
    fundamentalScore: fundamentalResult.score,
    sentimentScore: sentimentScoreResult.score,
    momentumScore: momentumResult.score,
    riskScore: riskResult.score,
    allDetails,
    symbol: upper,
    signalFreshness,
  })

  // Cache the result
  scoreCache.set(upper, { data: score, timestamp: Date.now() })

  return score
}

// ── Helper: fetch ~400 days of chart data (covers 252 trading days for 12m momentum) ──
async function fetchChartData(symbol: string) {
  const d = new Date()
  d.setDate(d.getDate() - 500) // ~350+ trading days for 12m returns
  const period1 = d.toISOString().split("T")[0]
  return getChart(symbol, period1, "1d")
}

// ── Helper: fetch fundamentals via quoteSummary ──
async function fetchFundamentals(symbol: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.quoteSummary(
    symbol,
    {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "earningsTrend",
        "recommendationTrend",
      ],
    },
    { validateResult: false },
  )

  const fd = result?.financialData ?? {}
  const ks = result?.defaultKeyStatistics ?? {}

  // EPS growth from earningsTrend
  let earningsGrowth: number | null = null
  let epsRevisionsUp30d: number | null = null
  let epsRevisionsDown30d: number | null = null
  let epsTrendCurrent: number | null = null
  let epsTrend90dAgo: number | null = null

  const trend = result?.earningsTrend?.trend
  if (Array.isArray(trend)) {
    // Look for next quarter (+1q) or current year (0y) trend data
    for (const t of trend) {
      if (t.growth != null && earningsGrowth == null) {
        earningsGrowth = t.growth
      }

      // EPS revision data — prefer +1q (next quarter) for freshness
      if (t.epsRevisions && epsRevisionsUp30d == null) {
        epsRevisionsUp30d = t.epsRevisions.upLast30days ?? null
        epsRevisionsDown30d = t.epsRevisions.downLast30days ?? null
      }

      // EPS trend comparison: current vs 90 days ago
      if (t.epsTrend && epsTrendCurrent == null) {
        epsTrendCurrent = t.epsTrend.current ?? null
        epsTrend90dAgo = t.epsTrend["90daysAgo"] ?? null
      }
    }
  }

  // Recommendation trend for dispersion calculation
  let recommendationTrend: {
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number
  } | null = null

  const recTrendArr = result?.recommendationTrend?.trend
  if (Array.isArray(recTrendArr) && recTrendArr.length > 0) {
    // Use the most recent period
    const latest = recTrendArr[0]
    recommendationTrend = {
      strongBuy: latest.strongBuy ?? 0,
      buy: latest.buy ?? 0,
      hold: latest.hold ?? 0,
      sell: latest.sell ?? 0,
      strongSell: latest.strongSell ?? 0,
    }
  }

  return {
    forwardPE: ks.forwardPE ?? fd.forwardPE ?? null,
    revenueGrowth: fd.revenueGrowth ?? null,
    profitMargins: fd.profitMargins ?? ks.profitMargins ?? null,
    returnOnEquity: fd.returnOnEquity ?? null,
    earningsGrowth: earningsGrowth ?? fd.earningsGrowth ?? null,
    recommendationKey: fd.recommendationKey ?? null,
    targetMeanPrice: fd.targetMeanPrice ?? null,
    beta: ks.beta ?? null,
    // EPS revision data
    epsRevisionsUp30d,
    epsRevisionsDown30d,
    epsTrendCurrent,
    epsTrend90dAgo,
    // Recommendation trend (for dispersion)
    recommendationTrend,
  }
}

// ── Helper: fetch insider transactions ──
async function fetchInsiderData(symbol: string) {
  if (!isFinnhubConfigured()) return null
  try {
    return await getInsiderTransactions(symbol)
  } catch {
    return null
  }
}

// ── Helper: fetch news headlines ──
async function fetchNews(symbol: string): Promise<string[]> {
  if (isFinnhubConfigured()) {
    try {
      const articles = await getCompanyNews(symbol, 7)
      if (articles.length > 0) {
        return articles.slice(0, 15).map((a) => a.headline).filter(Boolean)
      }
    } catch {
      // fall through
    }
  }

  try {
    const yahooNews = await getYahooNews(symbol)
    return yahooNews
      .slice(0, 15)
      .map((a: { title: string }) => a.title)
      .filter(Boolean)
  } catch {
    return []
  }
}

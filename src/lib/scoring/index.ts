/**
 * Stock Scoring Engine — main entry point.
 * Fetches all needed data in parallel and computes a multi-factor score.
 */

import YahooFinance from "yahoo-finance2"
import { getChart } from "@/lib/market/yahoo"
import {
  computeRSI,
  computeMACD,
  computeSMA,
  computeBollingerBands,
} from "@/lib/market/technicals"
import { getStockSentiment } from "@/lib/market/reddit"
import { getFearGreedIndex } from "@/lib/market/fear-greed"
import { getCompanyNews, isFinnhubConfigured } from "@/lib/market/finnhub"
import { getNews as getYahooNews } from "@/lib/market/yahoo"

import { computeTechnicalScore, type TechnicalInput } from "./technical-score"
import { computeFundamentalScore, type FundamentalInput } from "./fundamental-score"
import { computeSentimentScore, classifyHeadline, type SentimentInput } from "./sentiment-score"
import { computeCompositeScore, computeMomentumScore, type StockScore } from "./composite-score"

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
  const [chartData, fundamentalsResult, sentimentResult, fearGreedResult, newsResult] =
    await Promise.allSettled([
      // Chart: ~300 days of daily data for technicals + momentum
      fetchChartData(upper),
      // Fundamentals from Yahoo quoteSummary
      fetchFundamentals(upper),
      // Reddit sentiment
      getStockSentiment(upper),
      // Fear & Greed
      getFearGreedIndex(),
      // News headlines
      fetchNews(upper),
    ])

  // ── Extract chart data for technicals ──
  const candles: Array<{ close: number; volume: number }> =
    chartData.status === "fulfilled" ? chartData.value : []
  const closes = candles.map((c) => c.close)
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

    // Volume ratio: current vs 20-day average
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

  const sentimentInput: SentimentInput = {
    newsPositive,
    newsNegative,
    newsNeutral,
    wsbSentiment: reddit?.wsbSentiment ?? null,
    wsbSentimentScore: reddit?.wsbSentimentScore ?? null,
    redditMentions: reddit?.redditMentions ?? null,
    fearGreedScore: fearGreed?.score ?? null,
    recommendationKey: fundData.recommendationKey ?? null,
  }

  const sentimentScoreResult = computeSentimentScore(sentimentInput)

  // ── Momentum ──
  // Find price ~63 trading days ago (3 months) and ~126 trading days ago (6 months)
  const price3mAgo = closes.length >= 63 ? closes[closes.length - 63] : null
  const price6mAgo = closes.length >= 126 ? closes[closes.length - 126] : null
  const momentumResult = computeMomentumScore(currentPrice, price3mAgo, price6mAgo)

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

  // ── Composite ──
  const score = computeCompositeScore(
    technicalResult.score,
    fundamentalResult.score,
    sentimentScoreResult.score,
    momentumResult.score,
    allDetails,
    upper,
  )

  // Cache the result
  scoreCache.set(upper, { data: score, timestamp: Date.now() })

  return score
}

// ── Helper: fetch ~300 days of chart data ──
async function fetchChartData(symbol: string) {
  const d = new Date()
  d.setDate(d.getDate() - 400) // ~300 trading days
  const period1 = d.toISOString().split("T")[0]
  return getChart(symbol, period1, "1d")
}

// ── Helper: fetch fundamentals via quoteSummary ──
async function fetchFundamentals(symbol: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.quoteSummary(
    symbol,
    { modules: ["financialData", "defaultKeyStatistics", "earningsTrend"] },
    { validateResult: false },
  )

  const fd = result?.financialData ?? {}
  const ks = result?.defaultKeyStatistics ?? {}

  // Try to extract EPS growth from earningsTrend
  let earningsGrowth: number | null = null
  const trend = result?.earningsTrend?.trend
  if (Array.isArray(trend)) {
    // Look for current year growth estimate
    for (const t of trend) {
      if (t.growth != null) {
        earningsGrowth = t.growth
        break
      }
    }
  }

  return {
    forwardPE: ks.forwardPE ?? fd.forwardPE ?? null,
    revenueGrowth: fd.revenueGrowth ?? null,
    profitMargins: fd.profitMargins ?? ks.profitMargins ?? null,
    returnOnEquity: fd.returnOnEquity ?? null,
    earningsGrowth: earningsGrowth ?? fd.earningsGrowth ?? null,
    recommendationKey: fd.recommendationKey ?? null,
  }
}

// ── Helper: fetch news headlines ──
async function fetchNews(symbol: string): Promise<string[]> {
  // Try Finnhub first, fall back to Yahoo
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

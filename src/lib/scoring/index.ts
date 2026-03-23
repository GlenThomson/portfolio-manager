/**
 * Stock Scoring Engine — main entry point.
 * Fetches all needed data in parallel and computes a two-part score:
 *   1. Investment Grade — is this a good business? (long-term quality)
 *   2. Entry Signal — is now a good time to buy? (technical timing)
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
import { computeFinancialHealthScore, type FinancialHealthInput } from "./financial-health-score"
import { computeGrowthScore, type GrowthInput } from "./growth-score"
import { computeEntryScore, type EntryInput } from "./entry-score"
import { computeCompositeScore, type StockScore, type SignalFreshness } from "./composite-score"

export type { StockScore } from "./composite-score"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] })

// ── Cache ──────────────────────────────────────────────────
const scoreCache = new Map<string, { data: StockScore; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

/**
 * Get a comprehensive two-part score for a stock symbol.
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

  // ── Technical indicators (computed once, used by both legacy and entry score) ──
  let rsi: number | null = null
  let macdHistogram: number | null = null
  let macdHistogramPrev: number | null = null
  let bollingerPercentB: number | null = null
  let sma50: number | null = null
  let sma200: number | null = null
  let volumeRatio: number | null = null

  if (closes.length >= 50) {
    const rsiValues = computeRSI(closes, 14)
    const macdResult = computeMACD(closes)
    const sma50Arr = computeSMA(closes, 50)
    const sma200Arr = computeSMA(closes, 200)
    const bb = computeBollingerBands(closes, 20, 2)

    rsi = rsiValues[lastIdx]
    macdHistogram = macdResult.histogram[lastIdx]
    macdHistogramPrev = lastIdx > 0 ? macdResult.histogram[lastIdx - 1] : null
    sma50 = sma50Arr[lastIdx]
    sma200 = sma200Arr[lastIdx]

    const bbUpper = bb.upper[lastIdx]
    const bbLower = bb.lower[lastIdx]
    bollingerPercentB =
      !isNaN(bbUpper) && !isNaN(bbLower) && bbUpper !== bbLower
        ? (currentPrice - bbLower) / (bbUpper - bbLower)
        : null

    const recentVolumes = volumes.slice(Math.max(0, lastIdx - 19), lastIdx + 1)
    const avgVolume =
      recentVolumes.length > 0
        ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
        : 0
    volumeRatio = avgVolume > 0 ? volumes[lastIdx] / avgVolume : null
  }

  // ── Fundamentals data ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fundData: any =
    fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : {}

  // ── ENTRY SIGNAL ──
  const entryInput: EntryInput = {
    rsi,
    bollingerPercentB,
    price: currentPrice,
    sma200,
    recentHigh52w: fundData.fiftyTwoWeekHigh ?? null,
  }
  const entryResult = computeEntryScore(entryInput)

  // ── INVESTMENT GRADE: Business Quality (fundamental) ──
  const fundamentalInput: FundamentalInput = {
    forwardPE: fundData.forwardPE ?? null,
    revenueGrowth: fundData.revenueGrowth ?? null,
    profitMargin: fundData.profitMargins ?? null,
    returnOnEquity: fundData.returnOnEquity ?? null,
    epsGrowth: fundData.earningsGrowth ?? null,
    sector: fundData.sector ?? null,
  }
  const fundamentalResult = computeFundamentalScore(fundamentalInput)

  // ── INVESTMENT GRADE: Growth & Earnings Power ──
  const growthInput: GrowthInput = {
    revenueGrowth: fundData.revenueGrowth ?? null,
    epsGrowth: fundData.earningsGrowth ?? null,
    epsRevisionsUp30d: fundData.epsRevisionsUp30d ?? null,
    epsRevisionsDown30d: fundData.epsRevisionsDown30d ?? null,
    epsTrendCurrent: fundData.epsTrendCurrent ?? null,
    epsTrend90dAgo: fundData.epsTrend90dAgo ?? null,
  }
  const growthResult = computeGrowthScore(growthInput)

  // ── INVESTMENT GRADE: Financial Health ──
  const healthInput: FinancialHealthInput = {
    debtToEquity: fundData.debtToEquity ?? null,
    freeCashflow: fundData.freeCashflow ?? null,
    marketCap: fundData.marketCap ?? null,
    currentRatio: fundData.currentRatio ?? null,
    operatingIncome: fundData.operatingIncome ?? null,
    interestExpense: fundData.interestExpense ?? null,
  }
  const healthResult = computeFinancialHealthScore(healthInput)

  // ── INVESTMENT GRADE: Insider Signal ──
  const insiderTxns =
    insiderResult.status === "fulfilled" ? insiderResult.value : null

  let insiderScore = 50
  const insiderDetails: Record<string, string> = {}

  if (insiderTxns != null) {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const recentTxns = insiderTxns.filter(
      (t) => new Date(t.transactionDate) >= ninetyDaysAgo
    )

    const buys = recentTxns.filter((t) => t.transactionCode === "P")
    const sells = recentTxns.filter((t) => t.transactionCode === "S")
    const netBuys = buys.length - sells.length

    const cSuitePattern = /\b(ceo|cfo|coo|cto|president|chairman|chief)\b/i
    const cSuiteBuys = buys.filter((t) => cSuitePattern.test(t.name)).length

    if (cSuiteBuys >= 2) {
      insiderScore = 85
      insiderDetails.activity = `${cSuiteBuys} C-suite purchases in 90 days — strong conviction`
    } else if (netBuys > 3) {
      insiderScore = 70
      insiderDetails.activity = `Net ${netBuys} insider purchases in 90 days — bullish`
    } else if (netBuys > 0) {
      insiderScore = 60
      insiderDetails.activity = `Net ${netBuys} insider purchase(s) in 90 days`
    } else if (netBuys < -3) {
      insiderScore = 30
      insiderDetails.activity = `Net ${Math.abs(netBuys)} insider sales in 90 days — bearish`
    } else if (netBuys < 0) {
      insiderScore = 40
      insiderDetails.activity = `Net ${Math.abs(netBuys)} insider sale(s) in 90 days`
    } else {
      insiderDetails.activity = "No significant insider activity in 90 days"
    }
  } else {
    insiderDetails.activity = "Insider data unavailable"
  }

  // ── DOWNSIDE RISK (max drawdown only) ──
  const maxDrawdownPct = closes.length >= 20 ? computeMaxDrawdown(closes) : null
  let downsideRiskScore = 50
  const downsideDetails: Record<string, string> = {}

  if (maxDrawdownPct != null) {
    if (maxDrawdownPct < 10) {
      downsideRiskScore = 85
      downsideDetails.drawdown = `Max drawdown ${maxDrawdownPct.toFixed(1)}% — resilient`
    } else if (maxDrawdownPct < 20) {
      downsideRiskScore = 65
      downsideDetails.drawdown = `Max drawdown ${maxDrawdownPct.toFixed(1)}% — moderate`
    } else if (maxDrawdownPct < 35) {
      downsideRiskScore = 40
      downsideDetails.drawdown = `Max drawdown ${maxDrawdownPct.toFixed(1)}% — significant`
    } else {
      downsideRiskScore = 20
      downsideDetails.drawdown = `Max drawdown ${maxDrawdownPct.toFixed(1)}% — severe`
    }
  } else {
    downsideDetails.drawdown = "Drawdown data unavailable"
  }

  // ── Legacy scores (kept for detail breakdown and backward compat) ──
  const technicalInput: TechnicalInput = {
    rsi, macdHistogram, macdHistogramPrev, bollingerPercentB,
    price: currentPrice, sma50, sma200, volumeRatio,
  }
  const technicalResult = computeTechnicalScore(technicalInput)

  const reddit = sentimentResult.status === "fulfilled" ? sentimentResult.value : null
  const fearGreed = fearGreedResult.status === "fulfilled" ? fearGreedResult.value : null
  const headlines: string[] = newsResult.status === "fulfilled" ? newsResult.value : []

  let newsPositive = 0, newsNegative = 0, newsNeutral = 0
  for (const h of headlines) {
    const cls = classifyHeadline(h)
    if (cls === "positive") newsPositive++
    else if (cls === "negative") newsNegative++
    else newsNeutral++
  }

  const recTrend = fundData.recommendationTrend ?? null
  let analystDispersion: number | null = null
  if (recTrend) {
    const counts = [
      recTrend.strongBuy ?? 0, recTrend.buy ?? 0, recTrend.hold ?? 0,
      recTrend.sell ?? 0, recTrend.strongSell ?? 0,
    ]
    const total = counts.reduce((a: number, b: number) => a + b, 0)
    if (total > 0) {
      const weights = [5, 4, 3, 2, 1]
      const mean = counts.reduce((sum: number, c: number, i: number) => sum + c * weights[i], 0) / total
      const variance = counts.reduce(
        (sum: number, c: number, i: number) => sum + c * Math.pow(weights[i] - mean, 2), 0
      ) / total
      analystDispersion = Math.sqrt(variance)
    }
  }

  let insiderNetBuys: number | null = null
  let insiderCsuiteBuys: number | null = null
  if (insiderTxns != null) {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const recentTxns = insiderTxns.filter((t) => new Date(t.transactionDate) >= ninetyDaysAgo)
    const buys = recentTxns.filter((t) => t.transactionCode === "P")
    const sells = recentTxns.filter((t) => t.transactionCode === "S")
    insiderNetBuys = buys.length - sells.length
    const cSuitePattern = /\b(ceo|cfo|coo|cto|president|chairman|chief)\b/i
    insiderCsuiteBuys = buys.filter((t) => cSuitePattern.test(t.name)).length
  }

  const sentimentInput: SentimentInput = {
    newsPositive, newsNegative, newsNeutral,
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

  const price3mAgo = closes.length >= 63 ? closes[closes.length - 63] : null
  const price6mAgo = closes.length >= 126 ? closes[closes.length - 126] : null
  const price12mAgo = closes.length >= 252 ? closes[closes.length - 252] : null

  const momentumInput: MomentumInput = {
    currentPrice, price3mAgo, price6mAgo, price12mAgo,
    epsRevisionsUp30d: fundData.epsRevisionsUp30d ?? null,
    epsRevisionsDown30d: fundData.epsRevisionsDown30d ?? null,
    epsTrendCurrent: fundData.epsTrendCurrent ?? null,
    epsTrend90dAgo: fundData.epsTrend90dAgo ?? null,
  }
  const momentumResult = computeMomentumScore(momentumInput)

  let atrPercent: number | null = null
  if (highs.length >= 14 && lows.length >= 14 && closes.length >= 14) {
    const atrValues = computeATR(highs, lows, closes, 14)
    const lastAtr = atrValues[atrValues.length - 1]
    if (lastAtr != null && !isNaN(lastAtr) && currentPrice > 0) {
      atrPercent = (lastAtr / currentPrice) * 100
    }
  }

  const riskInput: RiskInput = {
    beta: fundData.beta ?? null,
    atrPercent,
    maxDrawdownPercent: maxDrawdownPct,
  }
  const riskResult = computeRiskScore(riskInput)

  // ── Signal freshness ──
  const signalFreshness: Record<string, SignalFreshness> = {
    businessQuality: fundData.forwardPE != null ? "fresh" : fundData.revenueGrowth != null ? "aging" : "stale",
    growth: fundData.epsTrendCurrent != null ? "fresh" : fundData.revenueGrowth != null ? "aging" : "stale",
    financialHealth: fundData.debtToEquity != null || fundData.freeCashflow != null ? "fresh" : "stale",
    insider: insiderTxns != null ? "fresh" : "stale",
    entry: closes.length >= 50 ? "fresh" : closes.length >= 20 ? "aging" : "stale",
  }

  // ── Combine all details ──
  const allDetails: Record<string, string> = {}

  // Investment grade details
  for (const [k, v] of Object.entries(fundamentalResult.details)) allDetails[`fund_${k}`] = v
  for (const [k, v] of Object.entries(growthResult.details)) allDetails[`growth_${k}`] = v
  for (const [k, v] of Object.entries(healthResult.details)) allDetails[`health_${k}`] = v
  for (const [k, v] of Object.entries(insiderDetails)) allDetails[`insider_${k}`] = v
  for (const [k, v] of Object.entries(downsideDetails)) allDetails[`downside_${k}`] = v

  // Entry signal details
  for (const [k, v] of Object.entries(entryResult.details)) allDetails[`entry_${k}`] = v

  // Legacy details (for backward compat)
  for (const [k, v] of Object.entries(technicalResult.details)) allDetails[`tech_${k}`] = v
  for (const [k, v] of Object.entries(sentimentScoreResult.details)) allDetails[`sent_${k}`] = v
  for (const [k, v] of Object.entries(momentumResult.details)) allDetails[`mom_${k}`] = v
  for (const [k, v] of Object.entries(riskResult.details)) allDetails[`risk_${k}`] = v

  // ── Composite ──
  const score = computeCompositeScore({
    fundamentalScore: fundamentalResult.score,
    growthScore: growthResult.score,
    financialHealthScore: healthResult.score,
    insiderScore,
    downsideRiskScore,
    entryScore: entryResult.score,
    // Legacy
    technicalScore: technicalResult.score,
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

// ── Helper: fetch ~400 days of chart data ──
async function fetchChartData(symbol: string) {
  const d = new Date()
  d.setDate(d.getDate() - 500)
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
        "assetProfile",
        "balanceSheetHistory",
        "incomeStatementHistory",
      ],
    },
    { validateResult: false },
  )

  const fd = result?.financialData ?? {}
  const ks = result?.defaultKeyStatistics ?? {}
  const sector: string | null = result?.assetProfile?.sector ?? null

  // EPS growth from earningsTrend
  let earningsGrowth: number | null = null
  let epsRevisionsUp30d: number | null = null
  let epsRevisionsDown30d: number | null = null
  let epsTrendCurrent: number | null = null
  let epsTrend90dAgo: number | null = null

  const trend = result?.earningsTrend?.trend
  if (Array.isArray(trend)) {
    for (const t of trend) {
      if (t.growth != null && earningsGrowth == null) {
        earningsGrowth = t.growth
      }
      if (t.epsRevisions && epsRevisionsUp30d == null) {
        epsRevisionsUp30d = t.epsRevisions.upLast30days ?? null
        epsRevisionsDown30d = t.epsRevisions.downLast30days ?? null
      }
      if (t.epsTrend && epsTrendCurrent == null) {
        epsTrendCurrent = t.epsTrend.current ?? null
        epsTrend90dAgo = t.epsTrend["90daysAgo"] ?? null
      }
    }
  }

  // Recommendation trend for dispersion
  let recommendationTrend: {
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number
  } | null = null

  const recTrendArr = result?.recommendationTrend?.trend
  if (Array.isArray(recTrendArr) && recTrendArr.length > 0) {
    const latest = recTrendArr[0]
    recommendationTrend = {
      strongBuy: latest.strongBuy ?? 0,
      buy: latest.buy ?? 0,
      hold: latest.hold ?? 0,
      sell: latest.sell ?? 0,
      strongSell: latest.strongSell ?? 0,
    }
  }

  // Financial health data
  const freeCashflow: number | null = fd.freeCashflow ?? null
  const marketCap: number | null = ks.marketCap ?? fd.marketCap ?? null
  const debtToEquity: number | null = fd.debtToEquity != null ? fd.debtToEquity / 100 : null // Yahoo returns as percentage
  const currentRatio: number | null = fd.currentRatio ?? null

  // Interest coverage from income statement
  let operatingIncome: number | null = null
  let interestExpense: number | null = null
  const incomeHistory = result?.incomeStatementHistory?.incomeStatementHistory
  if (Array.isArray(incomeHistory) && incomeHistory.length > 0) {
    const latest = incomeHistory[0]
    operatingIncome = latest.operatingIncome ?? null
    interestExpense = latest.interestExpense ?? null
  }

  // 52-week high
  const fiftyTwoWeekHigh: number | null = ks.fiftyTwoWeekHigh ?? null

  return {
    forwardPE: ks.forwardPE ?? fd.forwardPE ?? null,
    revenueGrowth: fd.revenueGrowth ?? null,
    profitMargins: fd.profitMargins ?? ks.profitMargins ?? null,
    returnOnEquity: fd.returnOnEquity ?? null,
    earningsGrowth: earningsGrowth ?? fd.earningsGrowth ?? null,
    recommendationKey: fd.recommendationKey ?? null,
    targetMeanPrice: fd.targetMeanPrice ?? null,
    beta: ks.beta ?? null,
    sector,
    fiftyTwoWeekHigh,
    // Financial health
    freeCashflow,
    marketCap,
    debtToEquity,
    currentRatio,
    operatingIncome,
    interestExpense,
    // EPS revision data
    epsRevisionsUp30d,
    epsRevisionsDown30d,
    epsTrendCurrent,
    epsTrend90dAgo,
    // Recommendation trend
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

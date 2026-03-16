const FINNHUB_BASE = "https://finnhub.io/api/v1"
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ?? ""

export interface FinnhubNewsItem {
  headline: string
  summary: string
  source: string
  url: string
  datetime: number
  image: string
  category: string
  sentiment?: string
}

export interface EarningsEvent {
  date: string
  epsActual: number | null
  epsEstimate: number | null
  hour: string
  quarter: number
  revenueActual: number | null
  revenueEstimate: number | null
  symbol: string
  year: number
}

export interface EarningsHistory {
  actual: number | null
  estimate: number | null
  period: string
  quarter: number
  surprise: number | null
  surprisePercent: number | null
  symbol: string
  year: number
}

export interface RecommendationTrend {
  buy: number
  hold: number
  period: string
  sell: number
  strongBuy: number
  strongSell: number
  symbol: string
}

export interface PriceTarget {
  lastUpdated: string
  symbol: string
  targetHigh: number
  targetLow: number
  targetMean: number
  targetMedian: number
}

export interface InsiderTransaction {
  name: string
  share: number
  change: number
  filingDate: string
  transactionDate: string
  transactionCode: string
  transactionPrice: number
}

export interface InsiderSentiment {
  symbol: string
  year: number
  month: number
  change: number
  mspr: number
}

// Simple in-memory cache with 5min TTL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, { data: any; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Rate limiter: 60 requests per minute
let requestTimestamps: number[] = []
const RATE_LIMIT = 60
const RATE_WINDOW = 60 * 1000 // 1 minute

function checkRateLimit(): boolean {
  const now = Date.now()
  requestTimestamps = requestTimestamps.filter((t) => now - t < RATE_WINDOW)
  if (requestTimestamps.length >= RATE_LIMIT) return false
  requestTimestamps.push(now)
  return true
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCached<T = any>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setCache(key: string, data: any) {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL })
}

export function isFinnhubConfigured(): boolean {
  return FINNHUB_API_KEY.length > 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFinnhubArticle(article: any): FinnhubNewsItem {
  return {
    headline: article.headline ?? "",
    summary: article.summary ?? "",
    source: article.source ?? "",
    url: article.url ?? "",
    datetime: article.datetime ?? 0,
    image: article.image ?? "",
    category: article.category ?? "",
  }
}

export async function getCompanyNews(
  symbol: string,
  daysBack: number = 7
): Promise<FinnhubNewsItem[]> {
  const cacheKey = `company:${symbol}:${daysBack}`
  const cached = getCached<FinnhubNewsItem[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) {
    throw new Error("Finnhub API key not configured")
  }

  if (!checkRateLimit()) {
    throw new Error("Finnhub rate limit exceeded")
  }

  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - daysBack)

  const toStr = to.toISOString().split("T")[0]
  const fromStr = from.toISOString().split("T")[0]

  const url = `${FINNHUB_BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Finnhub API error: ${res.status}`)
  }

  const data = await res.json()
  const articles = Array.isArray(data)
    ? data.map(mapFinnhubArticle)
    : []

  setCache(cacheKey, articles)
  return articles
}

export async function getMarketNews(
  category: string = "general"
): Promise<FinnhubNewsItem[]> {
  const cacheKey = `market:${category}`
  const cached = getCached<FinnhubNewsItem[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) {
    throw new Error("Finnhub API key not configured")
  }

  if (!checkRateLimit()) {
    throw new Error("Finnhub rate limit exceeded")
  }

  const url = `${FINNHUB_BASE}/news?category=${encodeURIComponent(category)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Finnhub API error: ${res.status}`)
  }

  const data = await res.json()
  const articles = Array.isArray(data)
    ? data.map(mapFinnhubArticle)
    : []

  setCache(cacheKey, articles)
  return articles
}

// --- Earnings Calendar ---

export async function getEarningsCalendar(
  from: string,
  to: string
): Promise<EarningsEvent[]> {
  const cacheKey = `earnings-calendar:${from}:${to}`
  const cached = getCached<EarningsEvent[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) return []
  if (!checkRateLimit()) return []

  const url = `${FINNHUB_BASE}/calendar/earnings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EarningsEvent[] = (data.earningsCalendar ?? []).map((e: any) => ({
    date: e.date ?? "",
    epsActual: e.epsActual ?? null,
    epsEstimate: e.epsEstimate ?? null,
    hour: e.hour ?? "",
    quarter: e.quarter ?? 0,
    revenueActual: e.revenueActual ?? null,
    revenueEstimate: e.revenueEstimate ?? null,
    symbol: e.symbol ?? "",
    year: e.year ?? 0,
  }))

  setCache(cacheKey, events)
  return events
}

// --- Earnings History for a specific stock ---

export async function getEarnings(symbol: string): Promise<EarningsHistory[]> {
  const cacheKey = `earnings:${symbol}`
  const cached = getCached<EarningsHistory[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) return []
  if (!checkRateLimit()) return []

  const url = `${FINNHUB_BASE}/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const earnings: EarningsHistory[] = (Array.isArray(data) ? data : []).map((e: any) => ({
    actual: e.actual ?? null,
    estimate: e.estimate ?? null,
    period: e.period ?? "",
    quarter: e.quarter ?? 0,
    surprise: e.surprise ?? null,
    surprisePercent: e.surprisePercent ?? null,
    symbol: e.symbol ?? symbol,
    year: e.year ?? 0,
  }))

  setCache(cacheKey, earnings)
  return earnings
}

// --- Recommendation Trends (analyst buy/sell/hold) ---

export async function getRecommendationTrends(
  symbol: string
): Promise<RecommendationTrend[]> {
  const cacheKey = `recommendation:${symbol}`
  const cached = getCached<RecommendationTrend[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) return []
  if (!checkRateLimit()) return []

  const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trends: RecommendationTrend[] = (Array.isArray(data) ? data : []).map((r: any) => ({
    buy: r.buy ?? 0,
    hold: r.hold ?? 0,
    period: r.period ?? "",
    sell: r.sell ?? 0,
    strongBuy: r.strongBuy ?? 0,
    strongSell: r.strongSell ?? 0,
    symbol: r.symbol ?? symbol,
  }))

  setCache(cacheKey, trends)
  return trends
}

// --- Price Target ---

export async function getPriceTarget(symbol: string): Promise<PriceTarget | null> {
  const cacheKey = `price-target:${symbol}`
  const cached = getCached<PriceTarget | null>(cacheKey)
  if (cached !== null) return cached

  if (!isFinnhubConfigured()) return null
  if (!checkRateLimit()) return null

  const url = `${FINNHUB_BASE}/stock/price-target?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  if (!data || !data.symbol) return null

  const target: PriceTarget = {
    lastUpdated: data.lastUpdated ?? "",
    symbol: data.symbol ?? symbol,
    targetHigh: data.targetHigh ?? 0,
    targetLow: data.targetLow ?? 0,
    targetMean: data.targetMean ?? 0,
    targetMedian: data.targetMedian ?? 0,
  }

  setCache(cacheKey, target)
  return target
}

// --- Insider Transactions ---

export async function getInsiderTransactions(
  symbol: string
): Promise<InsiderTransaction[]> {
  const cacheKey = `insider-tx:${symbol}`
  const cached = getCached<InsiderTransaction[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) return []
  if (!checkRateLimit()) return []

  const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txns: InsiderTransaction[] = (data.data ?? []).map((t: any) => ({
    name: t.name ?? "",
    share: t.share ?? 0,
    change: t.change ?? 0,
    filingDate: t.filingDate ?? "",
    transactionDate: t.transactionDate ?? "",
    transactionCode: t.transactionCode ?? "",
    transactionPrice: t.transactionPrice ?? 0,
  }))

  setCache(cacheKey, txns)
  return txns
}

// --- Insider Sentiment (aggregated) ---

export async function getInsiderSentiment(
  symbol: string
): Promise<InsiderSentiment[]> {
  const cacheKey = `insider-sentiment:${symbol}`
  const cached = getCached<InsiderSentiment[]>(cacheKey)
  if (cached) return cached

  if (!isFinnhubConfigured()) return []
  if (!checkRateLimit()) return []

  const now = new Date()
  const fromDate = new Date(now)
  fromDate.setFullYear(fromDate.getFullYear() - 1)
  const fromStr = fromDate.toISOString().split("T")[0]
  const toStr = now.toISOString().split("T")[0]

  const url = `${FINNHUB_BASE}/stock/insider-sentiment?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${FINNHUB_API_KEY}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentiments: InsiderSentiment[] = (data.data ?? []).map((s: any) => ({
    symbol: s.symbol ?? symbol,
    year: s.year ?? 0,
    month: s.month ?? 0,
    change: s.change ?? 0,
    mspr: s.mspr ?? 0,
  }))

  setCache(cacheKey, sentiments)
  return sentiments
}

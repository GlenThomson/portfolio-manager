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

// Simple in-memory cache with 5min TTL
const cache = new Map<string, { data: FinnhubNewsItem[]; expiry: number }>()
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

function getCached(key: string): FinnhubNewsItem[] | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: FinnhubNewsItem[]) {
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
  const cached = getCached(cacheKey)
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
  const cached = getCached(cacheKey)
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

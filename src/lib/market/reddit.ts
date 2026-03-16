/**
 * Reddit sentiment data client
 * Uses free Tradestie and ApeWisdom APIs — no keys required.
 * Results are cached for 15 minutes to stay well within rate limits.
 */

// ── Types ──────────────────────────────────────────────────
export interface WSBTrending {
  ticker: string
  no_of_comments: number
  sentiment: string // "Bullish" | "Bearish"
  sentiment_score: number // 0-1
}

export interface StockMention {
  ticker: string
  name: string
  mentions: number
  rank: number
  upvotes: number
}

// ── Cache ──────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// ── Tradestie API: WSB trending stocks ─────────────────────
export async function getWSBTrending(count = 50): Promise<WSBTrending[]> {
  const cacheKey = `wsb-trending-${count}`
  const cached = getCached<WSBTrending[]>(cacheKey)
  if (cached) return cached

  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const res = await fetch(
      `https://tradestie.com/api/v1/apps/reddit?date=${today}`,
      { next: { revalidate: 900 } } // 15 min ISR cache
    )

    if (!res.ok) {
      console.warn(`Tradestie API returned ${res.status}`)
      return []
    }

    const data: WSBTrending[] = await res.json()
    const trimmed = data.slice(0, count)
    setCache(cacheKey, trimmed)
    return trimmed
  } catch (error) {
    console.warn("Tradestie API error:", error)
    return []
  }
}

// ── ApeWisdom API: stock mentions across reddit ────────────
export async function getStockMentions(
  ticker?: string
): Promise<StockMention[]> {
  const cacheKey = `stock-mentions`
  const cached = getCached<StockMention[]>(cacheKey)

  let allMentions: StockMention[]

  if (cached) {
    allMentions = cached
  } else {
    try {
      const res = await fetch(
        "https://apewisdom.io/api/v1.0/filter/all-stocks/page/1",
        { next: { revalidate: 900 } }
      )

      if (!res.ok) {
        console.warn(`ApeWisdom API returned ${res.status}`)
        return []
      }

      const data = await res.json()
      // ApeWisdom returns { results: [...] }
      const results: Array<{
        ticker: string
        name: string
        mentions: number
        rank: number
        upvotes: number
      }> = data.results ?? []

      allMentions = results.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        mentions: r.mentions,
        rank: r.rank,
        upvotes: r.upvotes,
      }))
      setCache(cacheKey, allMentions)
    } catch (error) {
      console.warn("ApeWisdom API error:", error)
      return []
    }
  }

  if (ticker) {
    const upper = ticker.toUpperCase()
    return allMentions.filter((m) => m.ticker === upper)
  }

  return allMentions
}

// ── Combined sentiment lookup for a single stock ───────────
export interface StockSentiment {
  ticker: string
  // From Tradestie (WSB)
  wsbComments: number | null
  wsbSentiment: string | null // "Bullish" | "Bearish"
  wsbSentimentScore: number | null
  // From ApeWisdom
  redditMentions: number | null
  redditRank: number | null
  redditUpvotes: number | null
}

export async function getStockSentiment(
  ticker: string
): Promise<StockSentiment> {
  const upper = ticker.toUpperCase()

  const [wsbData, mentionData] = await Promise.all([
    getWSBTrending(100),
    getStockMentions(upper),
  ])

  const wsbEntry = wsbData.find((w) => w.ticker === upper)
  const mentionEntry = mentionData.length > 0 ? mentionData[0] : null

  return {
    ticker: upper,
    wsbComments: wsbEntry?.no_of_comments ?? null,
    wsbSentiment: wsbEntry?.sentiment ?? null,
    wsbSentimentScore: wsbEntry?.sentiment_score ?? null,
    redditMentions: mentionEntry?.mentions ?? null,
    redditRank: mentionEntry?.rank ?? null,
    redditUpvotes: mentionEntry?.upvotes ?? null,
  }
}

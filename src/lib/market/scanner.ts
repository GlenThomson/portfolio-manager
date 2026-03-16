import YahooFinance from "yahoo-finance2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false },
})

// --- Cache layer ---
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T
  }
  return null
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// --- Types ---
export interface ScanResult {
  symbol: string
  shortName: string
  price: number
  change: number
  changePercent: number
  volume: number
  averageVolume: number
  marketCap: number
}

export interface SectorResult {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

export interface FiftyTwoWeekResult {
  symbol: string
  shortName: string
  price: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  distanceFromHigh: number // percentage below 52w high
  distanceFromLow: number // percentage above 52w low
  nearHigh: boolean // within 5% of 52w high
  nearLow: boolean // within 5% of 52w low
}

// --- Helper: screener with validation disabled ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runScreener(scrIds: string, count: number): Promise<any> {
  return yahooFinance.screener(
    { scrIds, count },
    undefined,
    { validateResult: false }
  )
}

// --- Helper: batch quote fetch ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchQuotes(symbols: string[]): Promise<any[]> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await yahooFinance.quote(symbol)
        return result
      } catch {
        return null
      }
    })
  )
  return results.filter(Boolean)
}

function toScanResult(q: Record<string, unknown>): ScanResult {
  return {
    symbol: (q.symbol as string) ?? "",
    shortName: (q.shortName as string) ?? (q.symbol as string) ?? "",
    price: (q.regularMarketPrice as number) ?? 0,
    change: (q.regularMarketChange as number) ?? 0,
    changePercent: (q.regularMarketChangePercent as number) ?? 0,
    volume: (q.regularMarketVolume as number) ?? 0,
    averageVolume: (q.averageDailyVolume3Month as number) ?? 0,
    marketCap: (q.marketCap as number) ?? 0,
  }
}

// --- Screener-based scans ---

// Well-known, high-volume US stocks to scan across
const SCAN_UNIVERSE = [
  "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "NVDA", "JPM",
  "V", "WMT", "JNJ", "UNH", "PG", "HD", "MA", "DIS", "PYPL",
  "NFLX", "ADBE", "CRM", "INTC", "CSCO", "PFE", "KO", "PEP",
  "MRK", "ABT", "TMO", "AVGO", "COST", "NKE", "LLY", "MCD",
  "AMD", "QCOM", "TXN", "ORCL", "IBM", "GE", "CAT", "BA",
  "GS", "MS", "C", "BLK", "AXP", "SCHW", "SPGI", "MMM",
]

/**
 * Scan for stocks with unusual volume (volume significantly above average).
 */
export async function scanUnusualVolume(
  count: number = 10
): Promise<ScanResult[]> {
  const cacheKey = `unusual_volume_${count}`
  const cached = getCached<ScanResult[]>(cacheKey)
  if (cached) return cached

  try {
    // Try screener first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await runScreener("most_actives", Math.max(count, 20))
    const quotes = result?.quotes ?? []
    if (quotes.length > 0) {
      const items: ScanResult[] = quotes
        .map(toScanResult)
        .filter(
          (s: ScanResult) =>
            s.averageVolume > 0 && s.volume / s.averageVolume > 1.5
        )
        .sort(
          (a: ScanResult, b: ScanResult) =>
            b.volume / (b.averageVolume || 1) -
            a.volume / (a.averageVolume || 1)
        )
        .slice(0, count)

      if (items.length > 0) {
        setCache(cacheKey, items)
        return items
      }
    }
  } catch {
    // screener may not be available, fall back to manual scan
  }

  // Fallback: scan universe
  const quotes = await fetchQuotes(SCAN_UNIVERSE)
  const items: ScanResult[] = quotes
    .map(toScanResult)
    .filter(
      (s) => s.averageVolume > 0 && s.volume / s.averageVolume > 1.5
    )
    .sort(
      (a, b) =>
        b.volume / (b.averageVolume || 1) - a.volume / (a.averageVolume || 1)
    )
    .slice(0, count)

  setCache(cacheKey, items)
  return items
}

/**
 * Scan for top gainers today.
 */
export async function scanTopGainers(
  count: number = 10
): Promise<ScanResult[]> {
  const cacheKey = `top_gainers_${count}`
  const cached = getCached<ScanResult[]>(cacheKey)
  if (cached) return cached

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await runScreener("day_gainers", count)
    const quotes = result?.quotes ?? []
    if (quotes.length > 0) {
      const items = quotes.map(toScanResult).slice(0, count)
      setCache(cacheKey, items)
      return items
    }
  } catch {
    // fall back to manual scan
  }

  // Fallback
  const quotes = await fetchQuotes(SCAN_UNIVERSE)
  const items = quotes
    .map(toScanResult)
    .filter((s) => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, count)

  setCache(cacheKey, items)
  return items
}

/**
 * Scan for top losers today.
 */
export async function scanTopLosers(
  count: number = 10
): Promise<ScanResult[]> {
  const cacheKey = `top_losers_${count}`
  const cached = getCached<ScanResult[]>(cacheKey)
  if (cached) return cached

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await runScreener("day_losers", count)
    const quotes = result?.quotes ?? []
    if (quotes.length > 0) {
      const items = quotes.map(toScanResult).slice(0, count)
      setCache(cacheKey, items)
      return items
    }
  } catch {
    // fall back to manual scan
  }

  // Fallback
  const quotes = await fetchQuotes(SCAN_UNIVERSE)
  const items = quotes
    .map(toScanResult)
    .filter((s) => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, count)

  setCache(cacheKey, items)
  return items
}

// --- Sector ETFs ---
const SECTOR_ETFS: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLE: "Energy",
  XLV: "Healthcare",
  XLI: "Industrials",
  XLC: "Communication Services",
  XLY: "Consumer Discretionary",
  XLP: "Consumer Staples",
  XLU: "Utilities",
  XLRE: "Real Estate",
  XLB: "Materials",
}

/**
 * Scan sector ETF performance.
 */
export async function scanSectorPerformance(): Promise<SectorResult[]> {
  const cacheKey = "sector_performance"
  const cached = getCached<SectorResult[]>(cacheKey)
  if (cached) return cached

  const symbols = Object.keys(SECTOR_ETFS)
  const quotes = await fetchQuotes(symbols)

  const results: SectorResult[] = quotes
    .map((q) => ({
      symbol: q.symbol as string,
      name: SECTOR_ETFS[q.symbol as string] ?? (q.shortName as string) ?? "",
      price: (q.regularMarketPrice as number) ?? 0,
      change: (q.regularMarketChange as number) ?? 0,
      changePercent: (q.regularMarketChangePercent as number) ?? 0,
    }))
    .sort((a, b) => b.changePercent - a.changePercent)

  setCache(cacheKey, results)
  return results
}

/**
 * Scan for stocks near 52-week high or low.
 */
export async function scan52WeekHighLow(
  watchlist?: string[]
): Promise<FiftyTwoWeekResult[]> {
  const symbols = watchlist && watchlist.length > 0 ? watchlist : SCAN_UNIVERSE
  const cacheKey = `52week_${symbols.join(",")}`
  const cached = getCached<FiftyTwoWeekResult[]>(cacheKey)
  if (cached) return cached

  const quotes = await fetchQuotes(symbols)

  const results: FiftyTwoWeekResult[] = quotes
    .filter(
      (q) =>
        q.fiftyTwoWeekHigh > 0 &&
        q.fiftyTwoWeekLow > 0 &&
        q.regularMarketPrice > 0
    )
    .map((q) => {
      const price = q.regularMarketPrice as number
      const high = q.fiftyTwoWeekHigh as number
      const low = q.fiftyTwoWeekLow as number
      const distanceFromHigh =
        high > 0 ? ((high - price) / high) * 100 : 0
      const distanceFromLow =
        low > 0 ? ((price - low) / low) * 100 : 0

      return {
        symbol: q.symbol as string,
        shortName: (q.shortName as string) ?? (q.symbol as string) ?? "",
        price,
        fiftyTwoWeekHigh: high,
        fiftyTwoWeekLow: low,
        distanceFromHigh: Math.round(distanceFromHigh * 100) / 100,
        distanceFromLow: Math.round(distanceFromLow * 100) / 100,
        nearHigh: distanceFromHigh <= 5,
        nearLow: distanceFromLow <= 5,
      }
    })
    .filter((r) => r.nearHigh || r.nearLow)
    .sort((a, b) => {
      // Near-high first, then near-low
      if (a.nearHigh && !b.nearHigh) return -1
      if (!a.nearHigh && b.nearHigh) return 1
      if (a.nearHigh && b.nearHigh)
        return a.distanceFromHigh - b.distanceFromHigh
      return a.distanceFromLow - b.distanceFromLow
    })

  setCache(cacheKey, results)
  return results
}

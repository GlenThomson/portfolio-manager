/**
 * CBOE Put/Call Ratio — free CSV download, no API key required.
 * Complements Fear & Greed as a market sentiment indicator.
 *
 * High put/call ratio (>1.0) = bearish sentiment (more puts than calls)
 * Low put/call ratio (<0.7) = bullish/complacent sentiment
 * Extreme values are often contrarian signals.
 */

const CBOE_TOTAL_PC_URL = "https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/totalpc.csv"
const CBOE_EQUITY_PC_URL = "https://cdn.cboe.com/resources/options/volume_and_call_put_ratios/equitypc.csv"

// In-memory cache
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours (updates daily)

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T
  cache.delete(key)
  return null
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() })
}

export interface PutCallRatioEntry {
  date: string
  calls: number
  puts: number
  total: number
  ratio: number
}

export interface PutCallData {
  type: "total" | "equity"
  entries: PutCallRatioEntry[]
  latestRatio: number | null
  latestDate: string | null
  avgRatio30d: number | null
  signal: "extreme_bearish" | "bearish" | "neutral" | "bullish" | "extreme_bullish" | null
}

function parseCSV(csvText: string): PutCallRatioEntry[] {
  const lines = csvText.trim().split("\n")
  if (lines.length < 2) return []

  // Skip header, parse data lines
  const entries: PutCallRatioEntry[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    if (cols.length < 4) continue

    // Format: DATE, CALLS, PUTS, TOTAL, P/C RATIO
    const date = cols[0]
    const calls = parseInt(cols[1], 10)
    const puts = parseInt(cols[2], 10)
    const total = parseInt(cols[3], 10)
    const ratio = cols.length >= 5 ? parseFloat(cols[4]) : puts / calls

    if (!isNaN(calls) && !isNaN(puts) && !isNaN(ratio)) {
      entries.push({ date, calls, puts, total, ratio })
    }
  }

  return entries
}

function classifyRatio(ratio: number): PutCallData["signal"] {
  if (ratio >= 1.2) return "extreme_bearish" // Contrarian bullish
  if (ratio >= 1.0) return "bearish"
  if (ratio >= 0.7) return "neutral"
  if (ratio >= 0.5) return "bullish"
  return "extreme_bullish" // Contrarian bearish — complacency
}

async function fetchPutCallCSV(
  url: string,
  type: "total" | "equity",
): Promise<PutCallData> {
  const cacheKey = `cboe:${type}`
  const cached = getCached<PutCallData>(cacheKey)
  if (cached) return cached

  const res = await fetch(url, {
    headers: {
      "User-Agent": "PortfolioAI/1.0 (investment research tool)",
    },
  })

  if (!res.ok) {
    throw new Error(`CBOE CSV fetch failed: ${res.status}`)
  }

  const text = await res.text()
  const entries = parseCSV(text)

  // Take last 60 entries (roughly 3 months of trading days)
  const recent = entries.slice(-60)

  const latest = recent.length > 0 ? recent[recent.length - 1] : null
  const last30 = recent.slice(-30)
  const avgRatio30d =
    last30.length > 0
      ? last30.reduce((sum, e) => sum + e.ratio, 0) / last30.length
      : null

  const result: PutCallData = {
    type,
    entries: recent,
    latestRatio: latest?.ratio ?? null,
    latestDate: latest?.date ?? null,
    avgRatio30d: avgRatio30d != null ? Math.round(avgRatio30d * 1000) / 1000 : null,
    signal: latest ? classifyRatio(latest.ratio) : null,
  }

  setCache(cacheKey, result)
  return result
}

/**
 * Fetch the total put/call ratio (includes index + equity options).
 */
export async function getTotalPutCallRatio(): Promise<PutCallData> {
  return fetchPutCallCSV(CBOE_TOTAL_PC_URL, "total")
}

/**
 * Fetch the equity-only put/call ratio (excludes index options).
 * More sensitive to retail sentiment.
 */
export async function getEquityPutCallRatio(): Promise<PutCallData> {
  return fetchPutCallCSV(CBOE_EQUITY_PC_URL, "equity")
}

export interface PutCallSnapshot {
  total: PutCallData
  equity: PutCallData
}

/**
 * Fetch both total and equity put/call ratios.
 */
export async function getPutCallSnapshot(): Promise<PutCallSnapshot> {
  const cacheKey = "cboe:snapshot"
  const cached = getCached<PutCallSnapshot>(cacheKey)
  if (cached) return cached

  const [total, equity] = await Promise.allSettled([
    getTotalPutCallRatio(),
    getEquityPutCallRatio(),
  ])

  const result: PutCallSnapshot = {
    total: total.status === "fulfilled"
      ? total.value
      : { type: "total", entries: [], latestRatio: null, latestDate: null, avgRatio30d: null, signal: null },
    equity: equity.status === "fulfilled"
      ? equity.value
      : { type: "equity", entries: [], latestRatio: null, latestDate: null, avgRatio30d: null, signal: null },
  }

  setCache(cacheKey, result)
  return result
}

/**
 * FRED (Federal Reserve Economic Data) API client.
 * Free API with 120 req/min. Get key at https://fredaccount.stlouisfed.org/apikeys
 *
 * Provides macro indicators: yield curve, VIX, CPI, unemployment, consumer sentiment,
 * Fed funds rate, initial claims. Gives the AI macro context for portfolio advice.
 */

const FRED_API_KEY = process.env.FRED_API_KEY ?? ""
const FRED_BASE = "https://api.stlouisfed.org/fred"

// In-memory cache
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour (macro data changes slowly)

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T
  cache.delete(key)
  return null
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() })
}

export function isFredConfigured(): boolean {
  return FRED_API_KEY.length > 0
}

/** Key FRED series IDs with descriptions */
export const FRED_SERIES = {
  // Yield curve & rates
  T10Y2Y: "10-Year minus 2-Year Treasury Spread (yield curve)",
  DGS10: "10-Year Treasury Yield",
  DGS2: "2-Year Treasury Yield",
  DFF: "Effective Federal Funds Rate",
  // Volatility
  VIXCLS: "CBOE VIX (Volatility Index)",
  // Inflation
  CPIAUCSL: "Consumer Price Index (All Urban, Seasonally Adjusted)",
  // Employment
  UNRATE: "Unemployment Rate",
  ICSA: "Initial Jobless Claims (Weekly)",
  // Consumer
  UMCSENT: "University of Michigan Consumer Sentiment",
} as const

export type FredSeriesId = keyof typeof FRED_SERIES

export interface FredObservation {
  date: string
  value: number
}

export interface FredSeriesData {
  seriesId: string
  title: string
  observations: FredObservation[]
  latestValue: number | null
  latestDate: string | null
}

/**
 * Fetch observations for a FRED series.
 * @param seriesId - FRED series ID (e.g., "T10Y2Y", "VIXCLS")
 * @param limit - Number of most recent observations (default 30)
 */
export async function getFredSeries(
  seriesId: string,
  limit: number = 30,
): Promise<FredSeriesData> {
  const cacheKey = `fred:${seriesId}:${limit}`
  const cached = getCached<FredSeriesData>(cacheKey)
  if (cached) return cached

  if (!isFredConfigured()) {
    return {
      seriesId,
      title: FRED_SERIES[seriesId as FredSeriesId] ?? seriesId,
      observations: [],
      latestValue: null,
      latestDate: null,
    }
  }

  const url = `${FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`FRED API error: ${res.status}`)
  }

  const data = await res.json()
  const observations: FredObservation[] = (data.observations ?? [])
    .filter((o: { value: string }) => o.value !== ".")
    .map((o: { date: string; value: string }) => ({
      date: o.date,
      value: parseFloat(o.value),
    }))
    .reverse() // chronological order

  const latest = observations.length > 0 ? observations[observations.length - 1] : null

  const result: FredSeriesData = {
    seriesId,
    title: FRED_SERIES[seriesId as FredSeriesId] ?? seriesId,
    observations,
    latestValue: latest?.value ?? null,
    latestDate: latest?.date ?? null,
  }

  setCache(cacheKey, result)
  return result
}

export interface MacroSnapshot {
  yieldCurveSpread: FredSeriesData | null // T10Y2Y
  vix: FredSeriesData | null // VIXCLS
  fedFundsRate: FredSeriesData | null // DFF
  unemployment: FredSeriesData | null // UNRATE
  cpi: FredSeriesData | null // CPIAUCSL
  consumerSentiment: FredSeriesData | null // UMCSENT
  initialClaims: FredSeriesData | null // ICSA
  treasury10y: FredSeriesData | null // DGS10
  treasury2y: FredSeriesData | null // DGS2
}

/**
 * Fetch a complete macro snapshot — all key indicators in parallel.
 * Returns null for any series that fails, so partial data is fine.
 */
export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  const cacheKey = "fred:macro-snapshot"
  const cached = getCached<MacroSnapshot>(cacheKey)
  if (cached) return cached

  if (!isFredConfigured()) {
    return {
      yieldCurveSpread: null,
      vix: null,
      fedFundsRate: null,
      unemployment: null,
      cpi: null,
      consumerSentiment: null,
      initialClaims: null,
      treasury10y: null,
      treasury2y: null,
    }
  }

  const series: { key: keyof MacroSnapshot; id: string; limit: number }[] = [
    { key: "yieldCurveSpread", id: "T10Y2Y", limit: 60 },
    { key: "vix", id: "VIXCLS", limit: 30 },
    { key: "fedFundsRate", id: "DFF", limit: 12 },
    { key: "unemployment", id: "UNRATE", limit: 12 },
    { key: "cpi", id: "CPIAUCSL", limit: 12 },
    { key: "consumerSentiment", id: "UMCSENT", limit: 12 },
    { key: "initialClaims", id: "ICSA", limit: 12 },
    { key: "treasury10y", id: "DGS10", limit: 30 },
    { key: "treasury2y", id: "DGS2", limit: 30 },
  ]

  const results = await Promise.allSettled(
    series.map((s) => getFredSeries(s.id, s.limit))
  )

  const snapshot: MacroSnapshot = {
    yieldCurveSpread: null,
    vix: null,
    fedFundsRate: null,
    unemployment: null,
    cpi: null,
    consumerSentiment: null,
    initialClaims: null,
    treasury10y: null,
    treasury2y: null,
  }

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      snapshot[series[i].key] = r.value
    }
  })

  setCache(cacheKey, snapshot)
  return snapshot
}

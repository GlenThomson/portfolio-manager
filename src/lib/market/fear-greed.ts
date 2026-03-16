/**
 * CNN Fear & Greed Index
 * Free API, no key required. Accepts a start date for historical data.
 */

export interface FearGreedHistoryPoint {
  date: number // timestamp ms
  score: number
  rating: string
}

export interface FearGreedData {
  score: number
  rating: string
  previousClose: number
  previous1Week: number
  previous1Month: number
  previous1Year: number
  timestamp: string
  history: FearGreedHistoryPoint[]
}

const cacheMap = new Map<string, { data: FearGreedData; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
}

export async function getFearGreedIndex(
  startDate?: string
): Promise<FearGreedData> {
  const cacheKey = startDate ?? "default"
  const cached = cacheMap.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  const url = startDate
    ? `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`
    : "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"

  const res = await fetch(url, { headers: HEADERS })

  if (!res.ok) {
    throw new Error(`CNN Fear & Greed API returned ${res.status}`)
  }

  const json = await res.json()
  const fg = json.fear_and_greed

  const histRaw = json.fear_and_greed_historical?.data ?? []
  const history: FearGreedHistoryPoint[] = histRaw.map(
    (p: { x: number; y: number; rating: string }) => ({
      date: p.x,
      score: Math.round(p.y * 10) / 10,
      rating: p.rating,
    })
  )

  const data: FearGreedData = {
    score: Math.round(fg.score * 10) / 10,
    rating: fg.rating,
    previousClose: Math.round(fg.previous_close * 10) / 10,
    previous1Week: Math.round(fg.previous_1_week * 10) / 10,
    previous1Month: Math.round(fg.previous_1_month * 10) / 10,
    previous1Year: Math.round(fg.previous_1_year * 10) / 10,
    timestamp: fg.timestamp,
    history,
  }

  cacheMap.set(cacheKey, { data, timestamp: Date.now() })
  return data
}

import { NextRequest, NextResponse } from "next/server"
import { getChart } from "@/lib/market/yahoo"

// Simple in-memory cache to avoid redundant Yahoo API calls
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 60_000 // 1 minute

function getCached(key: string) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
  cache.delete(key)
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const period = searchParams.get("period") ?? "6mo"
  const interval = searchParams.get("interval") ?? "1d"
  const before = searchParams.get("before") // Unix timestamp — fetch data ending before this date

  if (!symbol) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
    const periodMap: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
    }
    const days = periodMap[period] ?? 180

    const endDate = before ? new Date(parseInt(before) * 1000) : new Date()
    const period1 = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const period2 = before ? endDate.toISOString().split("T")[0] : undefined

    const cacheKey = `${symbol.toUpperCase()}:${period1}:${interval}:${period2 ?? "now"}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    const data = await getChart(symbol.toUpperCase(), period1, interval, period2)
    cache.set(cacheKey, { data, ts: Date.now() })

    // Evict old entries if cache grows too large
    if (cache.size > 100) {
      const now = Date.now()
      cache.forEach((v, k) => {
        if (now - v.ts > CACHE_TTL) cache.delete(k)
      })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Chart fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 })
  }
}

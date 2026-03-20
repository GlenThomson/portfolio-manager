import { NextRequest, NextResponse } from "next/server"
import { getChart } from "@/lib/market/yahoo"
import { isValidSymbol } from "@/lib/validation"

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

  if (!isValidSymbol(symbol)) {
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
    let days = periodMap[period] ?? 180

    // Yahoo Finance limits: intraday intervals have max lookback periods
    // Use conservative values (a few days less) since Yahoo's limits are approximate
    const maxDaysForInterval: Record<string, number> = {
      "1m": 6,
      "2m": 6,
      "5m": 55,
      "15m": 55,
      "30m": 55,
      "60m": 700,
      "1h": 700,
    }
    const maxDays = maxDaysForInterval[interval]
    if (maxDays && days > maxDays) {
      days = maxDays
    }

    const endDate = before ? new Date(parseInt(before) * 1000) : new Date()

    // For intraday intervals, clamp the entire date range to Yahoo's allowed window
    if (maxDays) {
      const earliestAllowed = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000)
      if (endDate < earliestAllowed) {
        // Request is entirely outside the allowed window — return empty
        return NextResponse.json([])
      }
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
      if (startDate < earliestAllowed) {
        // Clamp start to the earliest allowed date
        days = Math.max(1, Math.floor((endDate.getTime() - earliestAllowed.getTime()) / (24 * 60 * 60 * 1000)))
      }
    }

    const period1 = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const period2 = before ? endDate.toISOString().split("T")[0] : undefined

    // Yahoo rejects when period1 === period2
    if (period2 && period1 === period2) {
      return NextResponse.json([])
    }

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

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (error: any) {
    // Return empty data for out-of-range requests instead of 500
    if (error?.message?.includes("not available for startTime")) {
      return NextResponse.json([])
    }
    console.error("Chart fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 })
  }
}

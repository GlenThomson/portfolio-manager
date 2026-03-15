import { NextRequest, NextResponse } from "next/server"
import { searchSymbols, getQuote } from "@/lib/market/yahoo"

// Simple in-memory cache for search results (1 minute TTL)
const cache = new Map<string, { data: unknown; expires: number }>()

function getCached(key: string) {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return entry.data
  cache.delete(key)
  return null
}

function setCache(key: string, data: unknown, ttlMs = 60_000) {
  cache.set(key, { data, expires: Date.now() + ttlMs })
  // Prevent unbounded growth
  if (cache.size > 200) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")
  const withPrices = searchParams.get("prices") !== "false"

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 })
  }

  const cacheKey = `search:${query.toLowerCase()}:${withPrices}`
  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60" },
    })
  }

  try {
    const results = await searchSymbols(query)

    if (!withPrices || results.length === 0) {
      setCache(cacheKey, results)
      return NextResponse.json(results, {
        headers: { "Cache-Control": "public, max-age=60" },
      })
    }

    // Fetch prices for results (limit to 8 to keep fast)
    const topResults = results.slice(0, 8)
    const priceResults = await Promise.allSettled(
      topResults.map((r: { symbol: string }) => getQuote(r.symbol))
    )

    const enriched = topResults.map(
      (
        r: {
          symbol: string
          shortName: string
          exchange: string
          type: string
        },
        i: number
      ) => {
        const priceResult = priceResults[i]
        if (
          priceResult.status === "fulfilled" &&
          priceResult.value.regularMarketPrice > 0
        ) {
          const q = priceResult.value
          return {
            ...r,
            price: q.regularMarketPrice,
            change: q.regularMarketChange,
            changePercent: q.regularMarketChangePercent,
            currency: q.currency,
          }
        }
        return r
      }
    )

    setCache(cacheKey, enriched)
    return NextResponse.json(enriched, {
      headers: { "Cache-Control": "public, max-age=60" },
    })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Failed to search" }, { status: 500 })
  }
}

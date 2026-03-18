import { NextRequest, NextResponse } from "next/server"
import { getFredSeries, getMacroSnapshot, isFredConfigured, FRED_SERIES } from "@/lib/market/fred"
import { getPutCallSnapshot } from "@/lib/market/cboe"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type") ?? "snapshot"
  const seriesId = searchParams.get("series")
  const limit = parseInt(searchParams.get("limit") ?? "30", 10)

  const cacheHeaders = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" }

  try {
    // Single FRED series
    if (type === "series" && seriesId) {
      if (!isFredConfigured()) {
        return NextResponse.json(
          { error: "FRED API key not configured. Set FRED_API_KEY environment variable." },
          { status: 503 },
        )
      }

      const data = await getFredSeries(seriesId, Math.min(limit, 500))
      return NextResponse.json(data, { headers: cacheHeaders })
    }

    // Put/call ratio
    if (type === "putcall") {
      const data = await getPutCallSnapshot()
      return NextResponse.json(data, { headers: cacheHeaders })
    }

    // Available FRED series
    if (type === "available") {
      return NextResponse.json({
        fredConfigured: isFredConfigured(),
        series: Object.entries(FRED_SERIES).map(([id, title]) => ({ id, title })),
      })
    }

    // Full macro snapshot (default)
    if (type === "snapshot") {
      const [macroData, putCallData] = await Promise.allSettled([
        getMacroSnapshot(),
        getPutCallSnapshot(),
      ])

      const snapshot = {
        fred: macroData.status === "fulfilled" ? macroData.value : null,
        fredConfigured: isFredConfigured(),
        putCall: putCallData.status === "fulfilled" ? putCallData.value : null,
      }

      return NextResponse.json(snapshot, { headers: cacheHeaders })
    }

    return NextResponse.json(
      { error: `Unknown type: ${type}. Use 'snapshot', 'series', 'putcall', or 'available'.` },
      { status: 400 },
    )
  } catch (error) {
    console.error("Macro data fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch macro data" },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import {
  scanTopGainers,
  scanTopLosers,
  scanUnusualVolume,
  scanSectorPerformance,
  scan52WeekHighLow,
} from "@/lib/market/scanner"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") ?? "gainers"
  const count = Math.min(parseInt(searchParams.get("count") ?? "10", 10), 50)

  try {
    switch (type) {
      case "gainers": {
        const data = await scanTopGainers(count)
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
      case "losers": {
        const data = await scanTopLosers(count)
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
      case "volume": {
        const data = await scanUnusualVolume(count)
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
      case "sectors": {
        const data = await scanSectorPerformance()
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
      case "52week": {
        const data = await scan52WeekHighLow()
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
      default:
        return NextResponse.json(
          { error: `Unknown scan type: ${type}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error("Scanner API error:", error)
    return NextResponse.json(
      { error: "Failed to scan market data" },
      { status: 500 }
    )
  }
}

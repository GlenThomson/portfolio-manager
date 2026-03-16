import { NextRequest, NextResponse } from "next/server"
import {
  getRecommendationTrends,
  getPriceTarget,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol parameter is required" },
      { status: 400 }
    )
  }

  if (!isFinnhubConfigured()) {
    return NextResponse.json(
      { error: "Finnhub API key not configured" },
      { status: 503 }
    )
  }

  try {
    const upperSymbol = symbol.toUpperCase()
    const [recommendations, priceTarget] = await Promise.all([
      getRecommendationTrends(upperSymbol),
      getPriceTarget(upperSymbol),
    ])

    return NextResponse.json({
      symbol: upperSymbol,
      recommendations,
      priceTarget,
    })
  } catch (error) {
    console.error("Analyst API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch analyst data" },
      { status: 500 }
    )
  }
}

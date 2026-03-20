import { NextRequest, NextResponse } from "next/server"
import {
  getWSBTrending,
  getStockMentions,
  getStockSentiment,
} from "@/lib/market/reddit"
import { isValidSymbol } from "@/lib/validation"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const symbol = searchParams.get("symbol")

  try {
    const cacheHeaders = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" }

    // Single stock sentiment
    if (symbol) {
      if (!isValidSymbol(symbol)) {
        return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 })
      }
      const sentiment = await getStockSentiment(symbol)
      return NextResponse.json(sentiment, { headers: cacheHeaders })
    }

    // WSB trending
    if (type === "trending") {
      const trending = await getWSBTrending(25)
      return NextResponse.json(trending, { headers: cacheHeaders })
    }

    // Top mentions across reddit
    if (type === "mentions") {
      const mentions = await getStockMentions()
      return NextResponse.json(mentions, { headers: cacheHeaders })
    }

    return NextResponse.json(
      { error: "Provide ?symbol=AAPL, ?type=trending, or ?type=mentions" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Sentiment API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch sentiment data" },
      { status: 500 }
    )
  }
}

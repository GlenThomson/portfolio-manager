import { NextRequest, NextResponse } from "next/server"
import {
  getWSBTrending,
  getStockMentions,
  getStockSentiment,
} from "@/lib/market/reddit"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const symbol = searchParams.get("symbol")

  try {
    // Single stock sentiment
    if (symbol) {
      const sentiment = await getStockSentiment(symbol)
      return NextResponse.json(sentiment)
    }

    // WSB trending
    if (type === "trending") {
      const trending = await getWSBTrending(25)
      return NextResponse.json(trending)
    }

    // Top mentions across reddit
    if (type === "mentions") {
      const mentions = await getStockMentions()
      return NextResponse.json(mentions)
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

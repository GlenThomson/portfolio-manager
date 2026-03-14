import { NextRequest, NextResponse } from "next/server"
import { getNews } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
    const news = await getNews(symbol.trim().toUpperCase())
    return NextResponse.json(news)
  } catch (error) {
    console.error("News fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 })
  }
}

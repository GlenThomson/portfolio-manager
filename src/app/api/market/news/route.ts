import { NextRequest, NextResponse } from "next/server"
import { isValidSymbol } from "@/lib/validation"
import { getNews as getYahooNews } from "@/lib/market/yahoo"
import {
  getCompanyNews,
  getMarketNews,
  isFinnhubConfigured,
  FinnhubNewsItem,
} from "@/lib/market/finnhub"

// Normalize Finnhub articles to the common format used by the frontend
function normalizeFinnhub(articles: FinnhubNewsItem[]) {
  return articles.map((a) => ({
    title: a.headline,
    publisher: a.source,
    link: a.url,
    publishedAt: a.datetime
      ? new Date(a.datetime * 1000).toISOString()
      : "",
    thumbnail: a.image || null,
  }))
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const category = searchParams.get("category")

  // Market-wide news (no symbol needed)
  if (category) {
    try {
      if (isFinnhubConfigured()) {
        const articles = await getMarketNews(category)
        return NextResponse.json(normalizeFinnhub(articles), {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
    } catch (error) {
      console.error("Finnhub market news error, falling back to Yahoo:", error)
    }

    // Fallback: use Yahoo search with a general term
    try {
      const news = await getYahooNews("market")
      return NextResponse.json(news, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      })
    } catch {
      return NextResponse.json([])
    }
  }

  // Company-specific news
  if (!isValidSymbol(symbol)) {
    return NextResponse.json(
      { error: "symbol or category parameter required" },
      { status: 400 }
    )
  }

  const upperSymbol = symbol.trim().toUpperCase()

  // Try Finnhub first if configured
  try {
    if (isFinnhubConfigured()) {
      const articles = await getCompanyNews(upperSymbol)
      if (articles.length > 0) {
        return NextResponse.json(normalizeFinnhub(articles), {
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
        })
      }
    }
  } catch (error) {
    console.error("Finnhub company news error, falling back to Yahoo:", error)
  }

  // Fallback to Yahoo news
  try {
    const news = await getYahooNews(upperSymbol)
    return NextResponse.json(news, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (error) {
    console.error("News fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    )
  }
}

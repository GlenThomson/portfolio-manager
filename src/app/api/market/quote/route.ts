import { NextRequest, NextResponse } from "next/server"
import { getQuote, getMultipleQuotes } from "@/lib/market/yahoo"
import { isValidSymbol } from "@/lib/validation"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols")

  if (!symbols) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 })
  }

  try {
    const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())

    if (symbolList.length > 50 || symbolList.some((s) => !isValidSymbol(s))) {
      return NextResponse.json({ error: "Invalid symbols parameter" }, { status: 400 })
    }

    if (symbolList.length === 1) {
      const quote = await getQuote(symbolList[0])
      return NextResponse.json(quote, {
        headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
      })
    }

    const quotes = await getMultipleQuotes(symbolList)
    return NextResponse.json(quotes, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    })
  } catch (error) {
    console.error("Quote fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 })
  }
}

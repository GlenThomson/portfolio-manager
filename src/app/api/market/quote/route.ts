import { NextRequest, NextResponse } from "next/server"
import { getQuote, getMultipleQuotes } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols")

  if (!symbols) {
    return NextResponse.json({ error: "symbols parameter required" }, { status: 400 })
  }

  try {
    const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase())

    if (symbolList.length === 1) {
      const quote = await getQuote(symbolList[0])
      return NextResponse.json(quote)
    }

    const quotes = await getMultipleQuotes(symbolList)
    return NextResponse.json(quotes)
  } catch (error) {
    console.error("Quote fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 })
  }
}

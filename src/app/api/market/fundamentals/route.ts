import { NextRequest, NextResponse } from "next/server"
import { getQuoteSummary } from "@/lib/market/yahoo"
import { isValidSymbol } from "@/lib/validation"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
    const fundamentals = await getQuoteSummary(symbol.trim().toUpperCase())
    return NextResponse.json(fundamentals, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  } catch (error) {
    console.error("Fundamentals fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch fundamentals" }, { status: 500 })
  }
}

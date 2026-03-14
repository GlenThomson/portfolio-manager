import { NextRequest, NextResponse } from "next/server"
import { getQuoteSummary } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
    const fundamentals = await getQuoteSummary(symbol.trim().toUpperCase())
    return NextResponse.json(fundamentals)
  } catch (error) {
    console.error("Fundamentals fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch fundamentals" }, { status: 500 })
  }
}

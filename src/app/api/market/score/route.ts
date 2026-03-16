import { NextRequest, NextResponse } from "next/server"
import { getStockScore } from "@/lib/scoring"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!symbol) {
    return NextResponse.json(
      { error: "symbol parameter required" },
      { status: 400 },
    )
  }

  try {
    const score = await getStockScore(symbol)
    return NextResponse.json(score)
  } catch (error) {
    console.error("Score fetch error:", error)
    return NextResponse.json(
      { error: `Failed to compute score for ${symbol}` },
      { status: 500 },
    )
  }
}

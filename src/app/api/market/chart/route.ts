import { NextRequest, NextResponse } from "next/server"
import { getChart } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const period = searchParams.get("period") ?? "6mo"
  const interval = searchParams.get("interval") ?? "1d"

  if (!symbol) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
    // Convert period shorthand to date
    const now = new Date()
    const periodMap: Record<string, number> = {
      "1d": 1,
      "5d": 5,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
      "2y": 730,
      "5y": 1825,
    }
    const days = periodMap[period] ?? 180
    const period1 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const data = await getChart(symbol.toUpperCase(), period1, interval)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Chart fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 })
  }
}

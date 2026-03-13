import { NextRequest, NextResponse } from "next/server"
import { getChart } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const period = searchParams.get("period") ?? "6mo"
  const interval = searchParams.get("interval") ?? "1d"
  const before = searchParams.get("before") // Unix timestamp — fetch data ending before this date

  if (!symbol) {
    return NextResponse.json({ error: "symbol parameter required" }, { status: 400 })
  }

  try {
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

    // If "before" is set, fetch a smaller chunk (1/3 of normal window) for faster load-more
    const endDate = before ? new Date(parseInt(before) * 1000) : new Date()
    const fetchDays = before ? Math.max(Math.ceil(days / 3), 5) : days
    const period1 = new Date(endDate.getTime() - fetchDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

    const data = await getChart(symbol.toUpperCase(), period1, interval, before ? endDate.toISOString().split("T")[0] : undefined)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Chart fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 500 })
  }
}

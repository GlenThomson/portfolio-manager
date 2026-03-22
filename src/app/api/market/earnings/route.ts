import { NextRequest, NextResponse } from "next/server"
import {
  getEarnings,
  getEarningsCalendar,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"
import { isValidSymbol } from "@/lib/validation"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol")
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  if (!isFinnhubConfigured()) {
    return NextResponse.json(
      { error: "Finnhub API key not configured" },
      { status: 503 }
    )
  }

  try {
    // If symbol is provided, return earnings history for that stock
    if (symbol) {
      if (!isValidSymbol(symbol)) {
        return NextResponse.json({ error: "Invalid symbol format" }, { status: 400 })
      }
      const earnings = await getEarnings(symbol.toUpperCase())
      return NextResponse.json({ symbol: symbol.toUpperCase(), earnings }, {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
      })
    }

    // If from/to are provided, return earnings calendar
    if (from && to) {
      const events = await getEarningsCalendar(from, to)
      return NextResponse.json({ from, to, events }, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
      })
    }

    // Default: return next 2 weeks of earnings
    const now = new Date()
    const twoWeeks = new Date(now)
    twoWeeks.setDate(twoWeeks.getDate() + 14)
    const defaultFrom = now.toISOString().split("T")[0]
    const defaultTo = twoWeeks.toISOString().split("T")[0]
    const events = await getEarningsCalendar(defaultFrom, defaultTo)
    return NextResponse.json({ from: defaultFrom, to: defaultTo, events }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    })
  } catch (error) {
    console.error("Earnings API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch earnings data" },
      { status: 500 }
    )
  }
}

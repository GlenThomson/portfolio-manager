import { NextRequest, NextResponse } from "next/server"
import { isValidSymbol } from "@/lib/validation"
import YahooFinance from "yahoo-finance2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] })

const cacheHeaders = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" }

export interface ChartEvent {
  time: number // unix timestamp
  type: "earnings" | "dividend" | "split"
  label: string
  detail: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 })
  }

  try {
    const events: ChartEvent[] = []

    // Fetch earnings, dividends, and splits from Yahoo Finance calendarEvents + earnings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [summaryResult, chartResult]: [any, any] = await Promise.allSettled([
      yahooFinance.quoteSummary(symbol.toUpperCase(), {
        modules: ["calendarEvents", "earnings"],
      }),
      yahooFinance.chart(symbol.toUpperCase(), {
        period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        interval: "1d" as const,
        events: "div,split",
      }),
    ])

    // Parse earnings dates from calendarEvents
    if (summaryResult.status === "fulfilled") {
      const summary = summaryResult.value
      const calEvents = summary?.calendarEvents

      // Upcoming earnings date
      if (calEvents?.earnings?.earningsDate) {
        const dates = Array.isArray(calEvents.earnings.earningsDate)
          ? calEvents.earnings.earningsDate
          : [calEvents.earnings.earningsDate]

        for (const d of dates) {
          if (d) {
            const date = d instanceof Date ? d : new Date(d)
            if (!isNaN(date.getTime())) {
              events.push({
                time: Math.floor(date.getTime() / 1000),
                type: "earnings",
                label: "E",
                detail: `Upcoming earnings: ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
              })
            }
          }
        }
      }

      // Past earnings from earningsHistory
      const earningsHistory = summary?.earnings?.earningsChart?.quarterly
      if (Array.isArray(earningsHistory)) {
        for (const q of earningsHistory) {
          if (q.date) {
            // Quarterly date format like "1Q2024" — convert to approximate date
            const match = q.date.match(/(\d)Q(\d{4})/)
            if (match) {
              const quarter = parseInt(match[1])
              const year = parseInt(match[2])
              // End-of-quarter months: Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec
              const month = quarter * 3 - 1 // 0-indexed: 2,5,8,11
              const date = new Date(year, month, 15)
              const actual = q.actual?.raw ?? q.actual
              const estimate = q.estimate?.raw ?? q.estimate

              events.push({
                time: Math.floor(date.getTime() / 1000),
                type: "earnings",
                label: "E",
                detail: `${q.date}: EPS $${typeof actual === "number" ? actual.toFixed(2) : "N/A"} vs est $${typeof estimate === "number" ? estimate.toFixed(2) : "N/A"}`,
              })
            }
          }
        }
      }
    }

    // Parse dividends and splits from chart events
    if (chartResult.status === "fulfilled" && chartResult.value) {
      const chartData = chartResult.value

      // Dividends
      if (chartData.events?.dividends) {
        const dividends = Array.isArray(chartData.events.dividends)
          ? chartData.events.dividends
          : Object.values(chartData.events.dividends)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const div of dividends as any[]) {
          const date = div.date instanceof Date ? div.date : new Date(div.date * 1000)
          const amount = div.amount ?? div.value ?? 0
          if (!isNaN(date.getTime()) && amount > 0) {
            events.push({
              time: Math.floor(date.getTime() / 1000),
              type: "dividend",
              label: "D",
              detail: `Dividend: $${amount.toFixed(2)}`,
            })
          }
        }
      }

      // Splits
      if (chartData.events?.splits) {
        const splits = Array.isArray(chartData.events.splits)
          ? chartData.events.splits
          : Object.values(chartData.events.splits)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const split of splits as any[]) {
          const date = split.date instanceof Date ? split.date : new Date(split.date * 1000)
          const num = split.numerator ?? split.splitRatio?.split(":")?.[0] ?? ""
          const den = split.denominator ?? split.splitRatio?.split(":")?.[1] ?? ""
          if (!isNaN(date.getTime())) {
            events.push({
              time: Math.floor(date.getTime() / 1000),
              type: "split",
              label: "S",
              detail: `Stock split: ${num}:${den}`,
            })
          }
        }
      }
    }

    // Sort by time and deduplicate
    events.sort((a, b) => a.time - b.time)

    return NextResponse.json(events, { headers: cacheHeaders })
  } catch (error) {
    console.error("Chart events fetch error:", error)
    return NextResponse.json([], { headers: cacheHeaders })
  }
}

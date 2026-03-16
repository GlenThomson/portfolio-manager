import { NextRequest, NextResponse } from "next/server"
import { getFearGreedIndex } from "@/lib/market/fear-greed"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const range = request.nextUrl.searchParams.get("range") ?? "1y"

    // Calculate start date based on range
    const now = new Date()
    let startDate: string | undefined
    switch (range) {
      case "1m":
        now.setMonth(now.getMonth() - 1)
        startDate = now.toISOString().slice(0, 10)
        break
      case "3m":
        now.setMonth(now.getMonth() - 3)
        startDate = now.toISOString().slice(0, 10)
        break
      case "6m":
        now.setMonth(now.getMonth() - 6)
        startDate = now.toISOString().slice(0, 10)
        break
      case "1y":
        // Default — no startDate needed, API returns ~1 year
        break
      case "2y":
        now.setFullYear(now.getFullYear() - 2)
        startDate = now.toISOString().slice(0, 10)
        break
      case "5y":
        now.setFullYear(now.getFullYear() - 5)
        startDate = now.toISOString().slice(0, 10)
        break
    }

    const data = await getFearGreedIndex(startDate)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Fear & Greed fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch Fear & Greed Index" },
      { status: 500 }
    )
  }
}

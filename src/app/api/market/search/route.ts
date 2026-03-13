import { NextRequest, NextResponse } from "next/server"
import { searchSymbols } from "@/lib/market/yahoo"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")

  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 })
  }

  try {
    const results = await searchSymbols(query)
    return NextResponse.json(results)
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Failed to search" }, { status: 500 })
  }
}

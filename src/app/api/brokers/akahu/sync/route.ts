import { NextRequest, NextResponse } from "next/server"
import { createClient, getServerUserId } from "@/lib/supabase/server"
import { syncAkahuInvestments } from "@/lib/brokers/akahu-sync"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { portfolioId, tickerOverrides } = await request.json()
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  try {
    const result = await syncAkahuInvestments(supabase, userId, portfolioId, tickerOverrides ?? {})
    return NextResponse.json({
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      unresolved: result.unresolved.length > 0 ? result.unresolved : undefined,
      needsMapping: result.needsMapping,
      message: result.message,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Akahu sync error:", msg)
    if (msg.includes("No Akahu connection")) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to sync positions" }, { status: 500 })
  }
}

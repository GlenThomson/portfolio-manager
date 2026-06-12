import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/polymarket/markets
 * Returns the most recent scan's results for the user, sorted by AI score desc.
 * Query: ?minScore=60 (default uses user settings) or ?all=true (no minScore filter)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const showAll = url.searchParams.get("all") === "true"
  const overrideMin = url.searchParams.get("minScore")

  // Find the latest scan date for this user
  const { data: latest } = await supabase
    .from("polymarket_scan_results")
    .select("scan_date")
    .eq("user_id", user.id)
    .order("scan_date", { ascending: false })
    .limit(1)
    .single()

  if (!latest) {
    return NextResponse.json({ scanDate: null, markets: [] })
  }

  let minScore = 0
  if (!showAll) {
    if (overrideMin != null) {
      minScore = Math.max(0, parseInt(overrideMin))
    } else {
      const { data: settings } = await supabase
        .from("polymarket_settings")
        .select("min_ai_score")
        .eq("user_id", user.id)
        .single()
      minScore = settings?.min_ai_score != null ? Number(settings.min_ai_score) : 60
    }
  }

  const { data: markets } = await supabase
    .from("polymarket_scan_results")
    .select("*")
    .eq("user_id", user.id)
    .eq("scan_date", latest.scan_date)
    .gte("ai_score", minScore)
    .order("ai_score", { ascending: false })

  return NextResponse.json({ scanDate: latest.scan_date, markets: markets ?? [] })
}

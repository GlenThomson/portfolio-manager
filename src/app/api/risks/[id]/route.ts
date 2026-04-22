import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface RouteContext {
  params: { id: string }
}

/**
 * GET /api/risks/[id]
 * Returns the monitor + latest N score snapshots for detail view.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [monitorRes, scoresRes] = await Promise.all([
    supabase.from("risk_monitors").select("*").eq("id", params.id).eq("user_id", user.id).single(),
    supabase
      .from("risk_scores")
      .select("*")
      .eq("monitor_id", params.id)
      .eq("user_id", user.id)
      .order("computed_at", { ascending: false })
      .limit(60),
  ])

  if (monitorRes.error || !monitorRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    monitor: monitorRes.data,
    scores: scoresRes.data ?? [],
  })
}

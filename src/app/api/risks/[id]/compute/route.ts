import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { computeRiskScore } from "@/lib/risks/compute"

export const maxDuration = 60

interface RouteContext {
  params: { id: string }
}

/**
 * POST /api/risks/[id]/compute
 * Runs a fresh compute cycle for this monitor (fetch news, score, persist).
 * Used by the "Refresh" button. Also used for initial score after creation.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify ownership
  const { data: existing } = await supabase
    .from("risk_monitors").select("id").eq("id", params.id).eq("user_id", user.id).single()
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const result = await computeRiskScore(params.id, { force: true })
    return NextResponse.json(result)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

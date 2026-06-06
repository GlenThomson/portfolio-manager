import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { scanForUser } from "@/lib/polymarket/scan"

export const maxDuration = 60

/**
 * POST /api/polymarket/scan — manual trigger of today's scan for the current user.
 */
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const result = await scanForUser(user.id)
    return NextResponse.json(result)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

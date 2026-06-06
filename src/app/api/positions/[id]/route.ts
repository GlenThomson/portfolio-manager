import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface RouteContext {
  params: { id: string }
}

/**
 * PATCH /api/positions/[id]
 * Currently supports closing a position: { close: true }
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.close === true) update.closed_at = new Date().toISOString()
  if (body.close === false) update.closed_at = null

  if (typeof body.source === "string") {
    const VALID_SOURCES = ["akahu", "ibkr", "csv", "manual", "unknown"]
    if (!VALID_SOURCES.includes(body.source)) {
      return NextResponse.json({ error: `source must be one of ${VALID_SOURCES.join(", ")}` }, { status: 400 })
    }
    update.source = body.source
  }

  const { data, error } = await supabase
    .from("portfolio_positions")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/**
 * DELETE /api/positions/[id]
 * Hard-deletes a position (and cascades transactions via FK? Only positions, not transactions).
 * Use PATCH { close: true } if you want a soft delete that preserves history.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await supabase
    .from("portfolio_positions")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

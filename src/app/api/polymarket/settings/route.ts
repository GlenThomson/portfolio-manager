import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("polymarket_settings")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return NextResponse.json(data ?? null)
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const allowed = [
    "wallet_address",
    "scan_enabled",
    "min_volume_usd",
    "min_liquidity_usd",
    "min_position_usd",
    "max_end_date_days",
    "min_end_date_days",
    "max_spread_cents",
    "excluded_categories",
    "preferred_categories",
    "notify_on_match",
    "min_ai_score",
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const { data: existing } = await supabase
    .from("polymarket_settings")
    .select("id")
    .eq("user_id", user.id)
    .single()

  if (existing) {
    const { data, error } = await supabase
      .from("polymarket_settings")
      .update(update)
      .eq("user_id", user.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } else {
    const { data, error } = await supabase
      .from("polymarket_settings")
      .insert({ user_id: user.id, ...update })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }
}

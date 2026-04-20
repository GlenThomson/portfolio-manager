import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isValidSymbol } from "@/lib/validation"

const VALID_STATES = ["drafted", "active", "needs_attention", "closed", "invalidated"]
const VALID_FREQ = ["weekly", "monthly", "on_earnings", "on_event"]

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")

  let query = supabase.from("position_plans").select("*").eq("user_id", user.id)
  if (symbol) query = query.eq("symbol", symbol.toUpperCase().trim())

  const { data, error } = await query.order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { symbol, state, entry_thesis, target_price, target_event, target_date,
          stop_price, stop_condition, review_frequency, review_next_date, notes } = body

  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "Valid symbol required" }, { status: 400 })
  }

  const insert: Record<string, unknown> = {
    user_id: user.id,
    symbol: symbol.toUpperCase().trim(),
    state: state && VALID_STATES.includes(state) ? state : "drafted",
    entry_thesis: entry_thesis ?? null,
    target_price: target_price != null ? Number(target_price) : null,
    target_event: target_event ?? null,
    target_date: target_date ?? null,
    stop_price: stop_price != null ? Number(stop_price) : null,
    stop_condition: stop_condition ?? null,
    review_frequency: review_frequency && VALID_FREQ.includes(review_frequency) ? review_frequency : "monthly",
    review_next_date: review_next_date ?? null,
    notes: notes ?? null,
  }

  const { data, error } = await supabase
    .from("position_plans")
    .upsert(insert, { onConflict: "user_id,symbol" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Verify ownership
  const { data: existing } = await supabase
    .from("position_plans").select("id").eq("id", id).eq("user_id", user.id).single()
  if (!existing) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

  // Whitelist updatable fields
  const allowed = ["state", "entry_thesis", "target_price", "target_event", "target_date",
                   "stop_price", "stop_condition", "review_frequency", "review_next_date", "notes"]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in fields) update[k] = fields[k]
  }
  if (update.state && !VALID_STATES.includes(update.state as string)) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 })
  }
  if (update.review_frequency && !VALID_FREQ.includes(update.review_frequency as string)) {
    return NextResponse.json({ error: "Invalid review_frequency" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("position_plans").update(update).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: plan } = await supabase
    .from("position_plans").select("id").eq("id", id).eq("user_id", user.id).single()
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 })

  const { error } = await supabase.from("position_plans").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

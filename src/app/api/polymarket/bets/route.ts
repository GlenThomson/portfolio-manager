import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const VALID_SIDES = new Set(["yes", "no"])

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const filter = url.searchParams.get("filter") // open | closed | all (default all)

  let query = supabase
    .from("polymarket_user_bets")
    .select("*")
    .eq("user_id", user.id)
    .order("entered_at", { ascending: false })

  if (filter === "open") query = query.is("exited_at", null)
  if (filter === "closed") query = query.not("exited_at", "is", null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { market_id, question, category, side, shares, avg_price_usd, thesis, notes, entered_at } = body

  if (!market_id || !side || shares == null || avg_price_usd == null) {
    return NextResponse.json({ error: "market_id, side, shares, avg_price_usd required" }, { status: 400 })
  }
  if (!VALID_SIDES.has(side)) {
    return NextResponse.json({ error: "side must be 'yes' or 'no'" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("polymarket_user_bets")
    .insert({
      user_id: user.id,
      market_id,
      question: question ?? null,
      category: category ?? null,
      side,
      shares: Number(shares).toString(),
      avg_price_usd: Number(avg_price_usd).toString(),
      entered_at: entered_at ?? new Date().toISOString(),
      thesis: thesis ?? null,
      notes: notes ?? null,
      source: "manual",
    })
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

  const { data: existing } = await supabase
    .from("polymarket_user_bets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()
  if (!existing) return NextResponse.json({ error: "Bet not found" }, { status: 404 })

  const allowed = ["thesis", "notes", "exit_price", "exited_at", "pnl_usd", "resolved", "resolution_outcome"]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in fields) update[k] = fields[k]
  }

  const { data, error } = await supabase
    .from("polymarket_user_bets")
    .update(update)
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabase
    .from("polymarket_user_bets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

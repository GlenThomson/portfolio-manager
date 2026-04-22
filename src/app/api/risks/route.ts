import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("risk_monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { title, description, keywords, linked_tickers, hedge_tickers, providers, alert_on_level, alert_on_change } = body

  if (!title || typeof title !== "string" || title.length < 2) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const VALID_PROVIDERS = ["news", "market", "polymarket", "taiwan_incursions"]
  const cleanProviders = Array.isArray(providers)
    ? providers.filter((p: unknown) => typeof p === "string" && VALID_PROVIDERS.includes(p as string))
    : ["news"]

  const { data, error } = await supabase
    .from("risk_monitors")
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description ?? null,
      keywords: Array.isArray(keywords) ? keywords : [],
      linked_tickers: Array.isArray(linked_tickers) ? linked_tickers : [],
      hedge_tickers: Array.isArray(hedge_tickers) ? hedge_tickers.filter((t: unknown) => typeof t === "string") : [],
      providers: cleanProviders.length > 0 ? cleanProviders : ["news"],
      alert_on_level: alert_on_level != null ? Number(alert_on_level) : null,
      alert_on_change: alert_on_change != null ? Number(alert_on_change) : null,
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
    .from("risk_monitors").select("id").eq("id", id).eq("user_id", user.id).single()
  if (!existing) return NextResponse.json({ error: "Monitor not found" }, { status: 404 })

  const allowed = ["title", "description", "keywords", "linked_tickers", "hedge_tickers", "providers", "alert_on_level", "alert_on_change", "is_active"]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in fields) update[k] = fields[k]
  }
  // Validate providers if provided
  if ("providers" in update) {
    const VALID_PROVIDERS = ["news", "market", "polymarket", "taiwan_incursions"]
    const arr = Array.isArray(update.providers) ? update.providers : []
    const clean = arr.filter((p: unknown) => typeof p === "string" && VALID_PROVIDERS.includes(p as string))
    update.providers = clean.length > 0 ? clean : ["news"]
  }

  const { data, error } = await supabase
    .from("risk_monitors").update(update).eq("id", id).select().single()
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

  const { error } = await supabase
    .from("risk_monitors").delete().eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("assets")
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
  const { name, type, value, currency, address, purchase_price, purchase_date, notes } = body

  if (!name || !type) {
    return NextResponse.json({ error: "Name and type are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      user_id: user.id,
      name,
      type,
      value: value ?? 0,
      currency: currency ?? "NZD",
      address: address ?? null,
      purchase_price: purchase_price ?? null,
      purchase_date: purchase_date ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("assets")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

  // Look up the asset to see if it was Akahu-sourced. If so, also add its ref to
  // the user's ignore list so the next sync doesn't recreate it.
  const { data: asset } = await supabase
    .from("assets")
    .select("id, notes")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

  const akahuRef = asset.notes && asset.notes.startsWith("akahu-") ? asset.notes : null

  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (akahuRef) {
    // Add to ignore list in user_profiles.settings
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, settings")
      .eq("user_id", user.id)
      .single()
    const existingSettings = (profile?.settings ?? {}) as { ignoredAkahuRefs?: string[] }
    const ignored = new Set(existingSettings.ignoredAkahuRefs ?? [])
    ignored.add(akahuRef)
    const updatedSettings = { ...existingSettings, ignoredAkahuRefs: Array.from(ignored) }
    if (profile) {
      await supabase.from("user_profiles").update({ settings: updatedSettings }).eq("id", profile.id)
    } else {
      await supabase.from("user_profiles").insert({ user_id: user.id, settings: updatedSettings })
    }
  }

  return NextResponse.json({ success: true, ignoredAkahuRef: akahuRef })
}

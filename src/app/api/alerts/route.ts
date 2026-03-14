import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { symbol, condition_type, condition_value } = body

  if (!symbol || !condition_type || condition_value === undefined) {
    return NextResponse.json(
      { error: "symbol, condition_type, and condition_value are required" },
      { status: 400 }
    )
  }

  const validConditions = ["above", "below", "pct_change"]
  if (!validConditions.includes(condition_type)) {
    return NextResponse.json(
      { error: "Invalid condition_type. Must be: above, below, or pct_change" },
      { status: 400 }
    )
  }

  const numericValue = parseFloat(condition_value)
  if (isNaN(numericValue)) {
    return NextResponse.json(
      { error: "condition_value must be a valid number" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("alerts")
    .insert({
      user_id: user.id,
      symbol: symbol.toUpperCase().trim(),
      condition_type,
      condition_value: numericValue,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id parameter required" }, { status: 400 })
  }

  // Verify ownership before deleting
  const { data: alert } = await supabase
    .from("alerts")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 })
  }

  const { error } = await supabase.from("alerts").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

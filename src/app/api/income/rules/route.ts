import { NextRequest, NextResponse } from "next/server"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { data, error } = await supabase
    .from("income_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { match_pattern, category, source_label } = await request.json()

  if (!match_pattern || !category) {
    return NextResponse.json({ error: "match_pattern and category are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("income_rules")
    .upsert(
      {
        user_id: userId,
        match_pattern: match_pattern.toLowerCase(),
        category,
        source_label: source_label ?? null,
      },
      { onConflict: "user_id,match_pattern" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

  const { error } = await supabase
    .from("income_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

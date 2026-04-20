import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const unreadOnly = searchParams.get("unread") === "true"
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200)

  let query = supabase.from("inbox_items").select("*").eq("user_id", user.id)
  if (unreadOnly) query = query.is("read_at", null)

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unread count (always return so UI can show badge)
  const { count } = await supabase
    .from("inbox_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null)

  return NextResponse.json({ items: data, unreadCount: count ?? 0 })
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { id, ids, markAllRead } = body

  const now = new Date().toISOString()

  if (markAllRead) {
    const { error } = await supabase
      .from("inbox_items").update({ read_at: now })
      .eq("user_id", user.id).is("read_at", null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const targetIds = Array.isArray(ids) ? ids : (id ? [id] : [])
  if (targetIds.length === 0) {
    return NextResponse.json({ error: "id, ids, or markAllRead required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("inbox_items").update({ read_at: now })
    .in("id", targetIds).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await supabase
    .from("inbox_items").delete().eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

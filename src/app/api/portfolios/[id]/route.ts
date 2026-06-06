import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface RouteContext {
  params: { id: string }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify ownership before deleting
  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single()
  if (!existing) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })

  // Cascade in schema removes positions + transactions automatically
  const { error } = await supabase.from("portfolios").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.name === "string") update.name = body.name
  if (typeof body.currency === "string") update.currency = body.currency
  if (typeof body.is_paper === "boolean") update.is_paper = body.is_paper

  const { data, error } = await supabase
    .from("portfolios")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

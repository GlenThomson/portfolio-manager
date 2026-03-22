import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select("date, net_worth, total_investments, total_cash, total_other_assets, total_liabilities")
    .eq("user_id", user.id)
    .order("date", { ascending: true })
    .limit(365)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { total_investments, total_cash, total_other_assets, total_liabilities, net_worth } = body

  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: user.id,
        date: today,
        total_investments: total_investments ?? 0,
        total_cash: total_cash ?? 0,
        total_other_assets: total_other_assets ?? 0,
        total_liabilities: total_liabilities ?? 0,
        net_worth: net_worth ?? 0,
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

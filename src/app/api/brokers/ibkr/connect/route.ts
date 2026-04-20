import { NextRequest, NextResponse } from "next/server"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/**
 * Store IBRIT credentials (token + queryId) for an IBKR connection.
 * Users get these from IBKR Client Portal → Third-Party Reports → PortfolioAI.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const { token, queryId } = await request.json()

  if (!token?.trim() || !queryId?.trim()) {
    return NextResponse.json(
      { error: "Both Token and Query ID are required" },
      { status: 400 }
    )
  }

  // Upsert broker connection — reuse access_token/refresh_token fields for IBRIT credentials
  const { data: existing } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("broker", "ibkr")
    .limit(1)
    .single()

  if (existing) {
    await supabase
      .from("broker_connections")
      .update({
        access_token: token.trim(),
        refresh_token: queryId.trim(),
      })
      .eq("id", existing.id)
  } else {
    await supabase.from("broker_connections").insert({
      user_id: userId,
      broker: "ibkr",
      access_token: token.trim(),
      refresh_token: queryId.trim(),
    })
  }

  return NextResponse.json({ success: true })
}

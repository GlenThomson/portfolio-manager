import { NextRequest, NextResponse } from "next/server"
import { exchangeCode } from "@/lib/brokers/ibkr"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  let stateData: { userId: string; portfolioId: string }
  try {
    stateData = JSON.parse(Buffer.from(state, "base64url").toString())
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 })
  }

  // Verify the state userId matches the authenticated user
  let currentUserId: string
  try {
    currentUserId = await getServerUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (stateData.userId !== currentUserId) {
    return NextResponse.json({ error: "State mismatch" }, { status: 403 })
  }

  try {
    const tokens = await exchangeCode(code)
    const supabase = createClient()

    // Upsert broker connection
    const { data: existing } = await supabase
      .from("broker_connections")
      .select("id")
      .eq("user_id", stateData.userId)
      .eq("broker", "ibkr")
      .limit(1)
      .single()

    if (existing) {
      await supabase
        .from("broker_connections")
        .update({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("broker_connections").insert({
        user_id: stateData.userId,
        broker: "ibkr",
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      })
    }

    // Redirect back to the portfolio page
    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(`${baseUrl}/portfolio/${stateData.portfolioId}?ibkr=connected`)
  } catch (error) {
    console.error("IBKR callback error:", error)
    return NextResponse.json({ error: "Failed to connect IBKR" }, { status: 500 })
  }
}

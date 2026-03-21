import { NextRequest, NextResponse } from "next/server"
import { exchangeCode } from "@/lib/brokers/akahu"
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
    // Akahu returns a long-lived user token (no refresh token needed)
    const accessToken = await exchangeCode(code)
    const supabase = createClient()

    // Upsert broker connection
    const { data: existing } = await supabase
      .from("broker_connections")
      .select("id")
      .eq("user_id", stateData.userId)
      .eq("broker", "akahu")
      .limit(1)
      .single()

    if (existing) {
      await supabase
        .from("broker_connections")
        .update({ access_token: accessToken })
        .eq("id", existing.id)
    } else {
      await supabase.from("broker_connections").insert({
        user_id: stateData.userId,
        broker: "akahu",
        access_token: accessToken,
      })
    }

    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(
      `${baseUrl}/portfolio/${stateData.portfolioId}?akahu=connected`
    )
  } catch (error) {
    console.error("Akahu callback error:", error)
    return NextResponse.json({ error: "Failed to connect Akahu" }, { status: 500 })
  }
}

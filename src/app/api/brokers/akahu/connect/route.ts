import { NextRequest, NextResponse } from "next/server"
import { AkahuClient } from "akahu"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/** POST: Save user's personal Akahu tokens (temporary until full OAuth is set up) */
export async function POST(request: NextRequest) {
  const userId = await getServerUserId()
  const { appToken, userToken } = await request.json()

  if (!appToken || !userToken) {
    return NextResponse.json(
      { error: "Both App Token and User Token are required" },
      { status: 400 }
    )
  }

  // Verify the tokens work by making a test API call
  try {
    const client = new AkahuClient({ appToken })
    await client.accounts.list(userToken)
  } catch {
    return NextResponse.json(
      { error: "Invalid tokens — could not connect to Akahu. Check your tokens and try again." },
      { status: 400 }
    )
  }

  // Store in broker_connections (appToken in account_id field, userToken as access_token)
  const supabase = createClient()

  const { data: existing } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("broker", "akahu")
    .limit(1)
    .single()

  if (existing) {
    const { error: updateErr } = await supabase
      .from("broker_connections")
      .update({
        access_token: userToken,
        account_id: appToken,
      })
      .eq("id", existing.id)

    if (updateErr) {
      console.error("Akahu connect update error:", updateErr)
      return NextResponse.json({ error: "Failed to save connection" }, { status: 500 })
    }
  } else {
    const { error: insertErr } = await supabase.from("broker_connections").insert({
      user_id: userId,
      broker: "akahu",
      access_token: userToken,
      account_id: appToken,
    })

    if (insertErr) {
      console.error("Akahu connect insert error:", insertErr)
      return NextResponse.json({ error: "Failed to save connection" }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

import { NextResponse } from "next/server"
import { fetchInvestmentAccounts, getPersonalUserToken } from "@/lib/brokers/akahu"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/** GET: List connected Akahu investment accounts and their holdings */
export async function GET() {
  const userId = await getServerUserId()
  const supabase = createClient()

  // Try DB connection first, then fall back to personal env token
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "akahu")
    .limit(1)
    .single()

  const accessToken = connection?.access_token ?? getPersonalUserToken()

  if (!accessToken) {
    return NextResponse.json({ error: "No Akahu connection found" }, { status: 404 })
  }

  try {
    const data = await fetchInvestmentAccounts(accessToken)
    return NextResponse.json(data)
  } catch (error) {
    console.error("Akahu accounts error:", error)
    return NextResponse.json({ error: "Failed to fetch Akahu accounts" }, { status: 500 })
  }
}

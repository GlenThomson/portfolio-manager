import { NextResponse } from "next/server"
import { isAkahuConfigured } from "@/lib/brokers/akahu"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/** GET: Check if Akahu is connected (via DB or env vars) */
export async function GET() {
  const userId = await getServerUserId()
  const supabase = createClient()

  // Check DB connection
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("id, last_sync_at")
    .eq("user_id", userId)
    .eq("broker", "akahu")
    .limit(1)
    .single()

  const envConfigured = isAkahuConfigured()

  return NextResponse.json({
    connected: !!connection || envConfigured,
    source: connection ? "oauth" : envConfigured ? "personal" : "none",
    lastSyncAt: connection?.last_sync_at ?? null,
  })
}

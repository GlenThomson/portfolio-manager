import { NextRequest, NextResponse } from "next/server"
import { createClient, getServerUserId } from "@/lib/supabase/server"
import { fetchFlexPositions } from "@/lib/brokers/ibkr-flex"

export const maxDuration = 60

/**
 * POST /api/brokers/ibkr/connect { token, queryId }
 *
 * Saves an IBKR Flex Web Service token + query ID. Runs a single test fetch
 * to verify the credentials before persisting (so we never store broken creds).
 *
 * Storage mapping (matches the existing broker_connections schema):
 *   access_token = Flex Web Service token
 *   account_id   = Flex Query ID
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const body = await request.json()
  const token = typeof body.token === "string" ? body.token.trim() : ""
  const queryId = typeof body.queryId === "string" ? body.queryId.trim() : ""

  if (!token || !queryId) {
    return NextResponse.json({ error: "token and queryId are required" }, { status: 400 })
  }
  if (!/^\d+$/.test(token) || !/^\d+$/.test(queryId)) {
    return NextResponse.json(
      { error: "token and queryId must be numeric (copy them directly from IBKR Account Management)" },
      { status: 400 },
    )
  }

  // Verify by trying a real fetch — fail fast if creds are wrong
  let positionsCount = 0
  let accountIds: string[] = []
  try {
    const result = await fetchFlexPositions(token, queryId)
    positionsCount = result.positions.length
    accountIds = result.accountIds
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `IBKR Flex test fetch failed: ${msg}` }, { status: 400 })
  }

  // Upsert into broker_connections
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
        access_token: token,
        account_id: queryId,
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
  } else {
    await supabase.from("broker_connections").insert({
      user_id: userId,
      broker: "ibkr",
      access_token: token,
      account_id: queryId,
      last_sync_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    ok: true,
    positionsFound: positionsCount,
    accountIds,
    message: `Connected. Found ${positionsCount} positions across ${accountIds.length} account(s).`,
  })
}

/**
 * DELETE /api/brokers/ibkr/connect — remove the saved connection
 */
export async function DELETE() {
  const supabase = createClient()
  const userId = await getServerUserId()

  await supabase
    .from("broker_connections")
    .delete()
    .eq("user_id", userId)
    .eq("broker", "ibkr")

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/brokers/ibkr/connect — returns whether the user has a connection
 */
export async function GET() {
  const supabase = createClient()
  const userId = await getServerUserId()
  const { data } = await supabase
    .from("broker_connections")
    .select("id, last_sync_at")
    .eq("user_id", userId)
    .eq("broker", "ibkr")
    .limit(1)
    .single()
  return NextResponse.json({ connected: !!data, lastSyncAt: data?.last_sync_at ?? null })
}

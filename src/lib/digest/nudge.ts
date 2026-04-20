import { createClient as createServiceClient, SupabaseClient } from "@supabase/supabase-js"

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

/**
 * Called by broker-sync routes when a new position is detected.
 * Creates an inbox "new_position_no_plan" nudge if the user has no plan
 * for this symbol and no recent unread nudge exists.
 *
 * Intentionally silent on all errors — sync flow must not break if nudging fails.
 */
export async function nudgeNewPosition(
  userId: string,
  symbol: string,
  supabaseAnon?: SupabaseClient,
): Promise<void> {
  try {
    const client = supabaseAnon ?? service()
    if (!client) return

    // 1. If user already has a plan for this symbol, no nudge needed
    const { data: existingPlan } = await client
      .from("position_plans").select("id").eq("user_id", userId).eq("symbol", symbol).limit(1)
    if (existingPlan && existingPlan.length > 0) return

    // 2. If there's an unread nudge for this symbol already, don't duplicate
    const { data: existingNudge } = await client
      .from("inbox_items").select("id")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .eq("type", "new_position_no_plan")
      .is("read_at", null)
      .limit(1)
    if (existingNudge && existingNudge.length > 0) return

    // 3. Create nudge
    await client.from("inbox_items").insert({
      user_id: userId,
      type: "new_position_no_plan",
      severity: "info",
      title: `${symbol} added — write a plan?`,
      body: `New position detected in your sync. Add an entry thesis, target, and stop so the daily digest can monitor it for you.`,
      symbol,
      action_url: `/stock/${symbol}?openPlan=1`,
    })
  } catch {
    // Silent
  }
}

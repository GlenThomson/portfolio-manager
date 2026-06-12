/**
 * Polymarket wallet sync — pulls open positions from a user's wallet and
 * upserts into polymarket_user_bets. Read-only; no transactions are signed.
 *
 * Convention:
 *  - Each (user, marketId, side) is one bet row
 *  - If position exists on Polymarket but not in our DB → insert (source=wallet_sync)
 *  - If position exists in both → update shares/price/current
 *  - If position in our DB (source=wallet_sync) but not on Polymarket → mark exited
 *  - Manual bets (source=manual) are never auto-modified by wallet sync
 */
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js"
import { fetchUserPositions, type PolymarketPosition } from "./data-client"

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

export interface WalletSyncResult {
  userId: string
  positionsFetched: number
  inserted: number
  updated: number
  exited: number
  error?: string
}

function sideFromOutcome(outcome: string): "yes" | "no" {
  return /^yes$/i.test(outcome) ? "yes" : "no"
}

export async function syncWalletForUser(userId: string, opts: { client?: SupabaseClient } = {}): Promise<WalletSyncResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase: any = opts.client ?? serviceClient()

  // Get wallet address from settings
  const { data: settings } = await supabase
    .from("polymarket_settings")
    .select("wallet_address")
    .eq("user_id", userId)
    .single()

  const wallet = settings?.wallet_address?.trim()
  if (!wallet) {
    return { userId, positionsFetched: 0, inserted: 0, updated: 0, exited: 0, error: "no_wallet" }
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return { userId, positionsFetched: 0, inserted: 0, updated: 0, exited: 0, error: "invalid_wallet" }
  }

  let positions: PolymarketPosition[] = []
  try {
    positions = await fetchUserPositions(wallet)
  } catch (err) {
    return {
      userId, positionsFetched: 0, inserted: 0, updated: 0, exited: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  // Existing wallet_sync bets in our DB (open ones)
  const { data: existingBets } = await supabase
    .from("polymarket_user_bets")
    .select("id, market_id, side")
    .eq("user_id", userId)
    .eq("source", "wallet_sync")
    .is("exited_at", null)

  const existingByKey = new Map<string, string>()
  for (const b of (existingBets ?? []) as Array<{ id: string; market_id: string; side: string }>) {
    existingByKey.set(`${b.market_id}:${b.side}`, b.id)
  }

  const seenKeys = new Set<string>()
  const now = new Date().toISOString()
  let inserted = 0
  let updated = 0

  for (const p of positions) {
    if (p.size <= 0 || !p.marketId) continue
    const side = sideFromOutcome(p.outcome)
    const key = `${p.marketId}:${side}`
    seenKeys.add(key)

    const row = {
      user_id: userId,
      market_id: p.marketId,
      question: p.question,
      category: p.category,
      side,
      shares: p.size.toString(),
      avg_price_usd: p.avgPrice.toString(),
      current_price_usd: p.currentPrice.toString(),
      current_price_at: now,
      pnl_usd: p.unrealizedPnl.toString(),
      source: "wallet_sync",
      updated_at: now,
    }

    const existingId = existingByKey.get(key)
    if (existingId) {
      await supabase.from("polymarket_user_bets").update(row).eq("id", existingId)
      updated++
    } else {
      await supabase.from("polymarket_user_bets").insert({ ...row, entered_at: now })
      inserted++
    }
  }

  // Anything in existingByKey not seen → exited
  let exited = 0
  for (const [key, id] of existingByKey) {
    if (seenKeys.has(key)) continue
    await supabase.from("polymarket_user_bets").update({
      exited_at: now,
      // exit_price stays whatever current_price_usd was — we don't know the actual exit price without trades parsing
      updated_at: now,
    }).eq("id", id)
    exited++
  }

  return { userId, positionsFetched: positions.length, inserted, updated, exited }
}

export async function syncWalletsForAllUsers(): Promise<{ usersProcessed: number; totalSynced: number }> {
  const supabase = serviceClient()
  const { data: settings } = await supabase
    .from("polymarket_settings")
    .select("user_id, wallet_address")
    .not("wallet_address", "is", null)

  let totalSynced = 0
  for (const row of settings ?? []) {
    try {
      const r = await syncWalletForUser(row.user_id, { client: supabase })
      if (!r.error) totalSynced += r.inserted + r.updated
    } catch (err) {
      console.error(`Wallet sync failed for ${row.user_id}:`, err)
    }
  }
  return { usersProcessed: settings?.length ?? 0, totalSynced }
}

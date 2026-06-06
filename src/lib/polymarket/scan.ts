/**
 * Polymarket scan orchestrator — fetch, filter, score, persist.
 * Used by both the manual scan endpoint and the daily cron.
 */
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { fetchActiveMarkets, filterMarkets, type PolymarketMarket } from "./client"
import { scoreMarkets, type MarketScore } from "./scorer"

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

interface UserSettings {
  user_id: string
  scan_enabled: boolean
  min_volume_usd: string | number
  min_liquidity_usd: string | number
  min_position_usd: string | number
  max_end_date_days: string | number
  min_end_date_days: string | number
  max_spread_cents: string | number
  excluded_categories: string[]
  preferred_categories: string[]
  min_ai_score: string | number
}

export interface ScanResult {
  userId: string
  marketsFetched: number
  marketsAfterFilter: number
  marketsScored: number
  topMatches: number          // markets that beat the user's min_ai_score
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: "",
  scan_enabled: true,
  min_volume_usd: 5000,
  min_liquidity_usd: 1000,
  min_position_usd: 100,
  max_end_date_days: 365,
  min_end_date_days: 5,
  max_spread_cents: 0.04,
  excluded_categories: ["Sports"],
  preferred_categories: [],
  min_ai_score: 60,
}

export async function scanForUser(userId: string): Promise<ScanResult> {
  const supabase = serviceClient()

  // Load user settings (or fall back to defaults if none)
  const { data: settingsRow } = await supabase
    .from("polymarket_settings")
    .select("*")
    .eq("user_id", userId)
    .single()
  const settings: UserSettings = settingsRow
    ? { ...DEFAULT_SETTINGS, ...settingsRow, user_id: userId }
    : { ...DEFAULT_SETTINGS, user_id: userId }

  if (!settings.scan_enabled) {
    return { userId, marketsFetched: 0, marketsAfterFilter: 0, marketsScored: 0, topMatches: 0 }
  }

  // 1. Fetch active markets
  const markets = await fetchActiveMarkets({ limit: 200 })

  // 2. Apply user filters
  const filtered = filterMarkets(markets, {
    minVolume: Number(settings.min_volume_usd),
    minLiquidity: Number(settings.min_liquidity_usd),
    minPositionUsd: Number(settings.min_position_usd),
    maxEndDateDays: Number(settings.max_end_date_days),
    minEndDateDays: Number(settings.min_end_date_days),
    maxSpread: Number(settings.max_spread_cents),
    excludedCategories: settings.excluded_categories,
    preferredCategories: settings.preferred_categories,
  })

  // 3. AI score (take top 20 by volume — enough signal, manageable AI cost)
  const candidates = filtered.slice(0, 20)
  const scores = await scoreMarkets(candidates)

  // 4. Persist all scored markets to today's snapshot
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)

  const rows = candidates.map((m: PolymarketMarket) => {
    const s: MarketScore = scores.get(m.id) ?? {
      marketId: m.id,
      score: 0,
      confidence: 0,
      thesis: "",
      suggestedSide: null,
      edgePct: 0,
      concerns: "Not scored",
    }
    return {
      user_id: userId,
      scan_date: todayStr,
      market_id: m.id,
      slug: m.slug,
      question: m.question,
      category: m.category,
      yes_price: m.yesPrice,
      no_price: m.noPrice,
      volume_24h: m.volume24h,
      liquidity: m.liquidity,
      end_date: m.endDate,
      market_url: m.marketUrl,
      ai_score: s.score,
      ai_confidence: s.confidence,
      ai_thesis: s.thesis,
      ai_suggested_side: s.suggestedSide,
      ai_edge_pct: s.edgePct,
      ai_concerns: s.concerns,
      raw_market: null,
    }
  })

  if (rows.length > 0) {
    // Wipe today's results and re-insert (so re-running gives fresh data)
    await supabase
      .from("polymarket_scan_results")
      .delete()
      .eq("user_id", userId)
      .eq("scan_date", todayStr)

    await supabase.from("polymarket_scan_results").insert(rows)
  }

  const minScore = Number(settings.min_ai_score)
  const topMatches = rows.filter((r) => Number(r.ai_score) >= minScore).length

  return {
    userId,
    marketsFetched: markets.length,
    marketsAfterFilter: filtered.length,
    marketsScored: rows.length,
    topMatches,
  }
}

export async function scanForAllUsers(): Promise<{ usersProcessed: number; totalMatches: number }> {
  const supabase = serviceClient()
  const { data: settings } = await supabase
    .from("polymarket_settings")
    .select("user_id")
    .eq("scan_enabled", true)

  let totalMatches = 0
  for (const row of settings ?? []) {
    try {
      const result = await scanForUser(row.user_id)
      totalMatches += result.topMatches
    } catch (err) {
      console.error(`Polymarket scan failed for ${row.user_id}:`, err)
    }
  }

  return { usersProcessed: settings?.length ?? 0, totalMatches }
}

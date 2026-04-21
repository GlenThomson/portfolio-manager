import { createClient as createServiceClient } from "@supabase/supabase-js"
import type { ProviderKey, ProviderResult, MonitorContext } from "./providers/types"
import { runNewsProvider } from "./providers/news"
import { runMarketProvider } from "./providers/market"
import { runPolymarketProvider } from "./providers/polymarket"
import { runTaiwanIncursionsProvider } from "./providers/taiwan-incursions"

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

interface RiskMonitorRow {
  id: string
  user_id: string
  title: string
  description: string | null
  keywords: string[]
  linked_tickers: string[]
  providers: ProviderKey[]
  alert_on_level: number | null
  alert_on_change: number | null
  latest_score: number | null
  latest_score_at: string | null
  is_active: boolean
}

const PROVIDER_RUNNERS: Record<ProviderKey, (ctx: MonitorContext) => Promise<ProviderResult>> = {
  news: runNewsProvider,
  market: runMarketProvider,
  polymarket: runPolymarketProvider,
  taiwan_incursions: runTaiwanIncursionsProvider,
}

/**
 * Compute a fresh risk score using the monitor's enabled providers.
 * Each provider produces an independent 0-100 signal; composite is
 * the weight-normalised average across providers that returned a
 * non-zero weight (errors → weight 0 → excluded).
 */
export async function computeRiskScore(monitorId: string, opts: { force?: boolean } = {}): Promise<{
  score: number
  summary: string
  providers: ProviderResult[]
}> {
  const supabase = serviceClient()

  const { data: monitor, error } = await supabase
    .from("risk_monitors")
    .select("*")
    .eq("id", monitorId)
    .single()
  if (error || !monitor) throw new Error(`Monitor ${monitorId} not found`)

  const m = monitor as RiskMonitorRow
  if (!m.is_active && !opts.force) {
    return {
      score: m.latest_score != null ? Number(m.latest_score) : 0,
      summary: "Monitor is paused",
      providers: [],
    }
  }

  const ctx: MonitorContext = {
    id: m.id,
    userId: m.user_id,
    title: m.title,
    description: m.description,
    keywords: m.keywords ?? [],
    linkedTickers: m.linked_tickers ?? [],
  }

  const enabledProviders = (Array.isArray(m.providers) && m.providers.length > 0)
    ? m.providers
    : ["news" as ProviderKey]

  // Run providers in parallel
  const results = await Promise.all(
    enabledProviders.map(async (key) => {
      const runner = PROVIDER_RUNNERS[key]
      if (!runner) {
        return {
          key,
          score: 0,
          weight: 0,
          summary: `Unknown provider: ${key}`,
          data: {},
          error: "unknown_provider",
        } as ProviderResult
      }
      try {
        return await runner(ctx)
      } catch (err) {
        return {
          key,
          score: 0,
          weight: 0,
          summary: `${key} failed`,
          data: {},
          error: err instanceof Error ? err.message : String(err),
        } as ProviderResult
      }
    }),
  )

  // Weighted composite (skip providers with weight 0 — errors or N/A data)
  const contributing = results.filter((r) => r.weight > 0 && !r.error)
  const totalWeight = contributing.reduce((s, r) => s + r.weight, 0)
  const composite = totalWeight > 0
    ? Math.round(contributing.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight)
    : 0

  // Short overall summary = leader's summary, or blend
  const leader = [...contributing].sort((a, b) => b.score * b.weight - a.score * a.weight)[0]
  const summary = leader?.summary ?? "No data available yet."

  // Persist
  const scoresInsert = {
    monitor_id: m.id,
    user_id: m.user_id,
    score: composite,
    components: {
      providers: results.map((r) => ({
        key: r.key,
        score: r.score,
        weight: r.weight,
        summary: r.summary,
        data: r.data,
        error: r.error,
      })),
      totalWeight,
      contributing: contributing.map((r) => r.key),
    },
    // Pull the news headlines out top-level for backward compatibility with the existing detail view
    headlines: results.find((r) => r.key === "news")?.data?.headlines ?? [],
    summary,
  }

  await supabase.from("risk_scores").insert(scoresInsert)

  // Alert check
  const prevScore = m.latest_score != null ? Number(m.latest_score) : null
  const delta = prevScore != null ? composite - prevScore : null
  const alertLevel = m.alert_on_level != null ? Number(m.alert_on_level) : null
  const alertChange = m.alert_on_change != null ? Number(m.alert_on_change) : null

  const crossedLevel = alertLevel != null && prevScore != null && prevScore < alertLevel && composite >= alertLevel
  const jumpedChange = alertChange != null && delta != null && Math.abs(delta) >= alertChange

  await supabase
    .from("risk_monitors")
    .update({
      latest_score: composite,
      latest_score_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", m.id)

  if (crossedLevel || jumpedChange) {
    const severity = composite >= 80 ? "urgent" : composite >= 60 ? "warning" : "info"
    const title = crossedLevel
      ? `${m.title} crossed alert level (${composite}/100)`
      : `${m.title} moved ${delta! > 0 ? "+" : ""}${delta} to ${composite}/100`

    const today = new Date().toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from("inbox_items")
      .select("id")
      .eq("user_id", m.user_id)
      .eq("type", "risk_alert")
      .eq("symbol", m.id)
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from("inbox_items").insert({
        user_id: m.user_id,
        type: "risk_alert",
        severity,
        title,
        body: summary,
        symbol: m.id,
        action_url: `/risks/${m.id}`,
      })
    }
  }

  return { score: composite, summary, providers: results }
}

export async function computeAllRisksForUser(userId: string): Promise<{ computed: number; failed: number }> {
  const supabase = serviceClient()
  const { data: monitors } = await supabase
    .from("risk_monitors")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)

  let computed = 0
  let failed = 0
  for (const m of monitors ?? []) {
    try {
      await computeRiskScore(m.id)
      computed++
    } catch (err) {
      console.error(`Failed to compute risk ${m.id}:`, err)
      failed++
    }
  }
  return { computed, failed }
}

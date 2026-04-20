import { createClient as createServiceClient } from "@supabase/supabase-js"
import { searchMultipleQueries } from "./news-search"
import { scoreHeadlinesForRisk } from "./ai-scorer"

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
  alert_on_level: number | null
  alert_on_change: number | null
  latest_score: number | null
  latest_score_at: string | null
  is_active: boolean
}

/**
 * Compute a fresh risk score for one monitor.
 * Fetches news for all keywords, AI-scores them, persists risk_scores row,
 * updates monitor.latest_score.
 *
 * If the score changes materially (vs. previous) or crosses the user's
 * alert threshold, creates an inbox item.
 */
export async function computeRiskScore(monitorId: string, opts: { force?: boolean } = {}): Promise<{
  score: number
  summary: string
  headlineCount: number
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
    return { score: m.latest_score ?? 0, summary: "Monitor is paused", headlineCount: 0 }
  }

  // Fetch news for all keywords (limit ~10 per query, dedupe by URL)
  const keywords = m.keywords.length > 0 ? m.keywords : [m.title]
  const headlines = await searchMultipleQueries(keywords, {
    limitPerQuery: 10,
    lookbackDays: 7,
  })

  // AI score the batch
  const result = await scoreHeadlinesForRisk(m.title, m.description ?? "", headlines)

  // Persist risk_scores row
  await supabase.from("risk_scores").insert({
    monitor_id: m.id,
    user_id: m.user_id,
    score: result.score,
    components: { news: { score: result.score, headlineCount: headlines.length } },
    headlines: result.headlines,
    summary: result.summary,
  })

  // Update monitor's latest_score
  await supabase
    .from("risk_monitors")
    .update({
      latest_score: result.score,
      latest_score_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", m.id)

  // Check alert conditions
  const prevScore = m.latest_score != null ? Number(m.latest_score) : null
  const delta = prevScore != null ? result.score - prevScore : null
  const alertLevel = m.alert_on_level != null ? Number(m.alert_on_level) : null
  const alertChange = m.alert_on_change != null ? Number(m.alert_on_change) : null

  const crossedLevel = alertLevel != null && prevScore != null && prevScore < alertLevel && result.score >= alertLevel
  const jumpedChange = alertChange != null && delta != null && Math.abs(delta) >= alertChange

  if (crossedLevel || jumpedChange) {
    const severity = result.score >= 80 ? "urgent" : result.score >= 60 ? "warning" : "info"
    const title = crossedLevel
      ? `${m.title} crossed alert level (${result.score}/100)`
      : `${m.title} moved ${delta! > 0 ? "+" : ""}${delta} to ${result.score}/100`

    // Only create nudge if no unread one exists for this monitor today
    const today = new Date().toISOString().slice(0, 10)
    const { data: existing } = await supabase
      .from("inbox_items")
      .select("id")
      .eq("user_id", m.user_id)
      .eq("type", "risk_alert")
      .eq("symbol", m.id) // using symbol field to hold monitor_id for idempotency
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from("inbox_items").insert({
        user_id: m.user_id,
        type: "risk_alert",
        severity,
        title,
        body: result.summary,
        symbol: m.id,
        action_url: `/risks/${m.id}`,
      })
    }
  }

  return {
    score: result.score,
    summary: result.summary,
    headlineCount: headlines.length,
  }
}

/**
 * Compute scores for all active monitors belonging to a user.
 */
export async function computeAllRisksForUser(userId: string): Promise<{
  computed: number
  failed: number
}> {
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

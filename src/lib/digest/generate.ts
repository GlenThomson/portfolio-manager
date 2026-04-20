/**
 * Daily digest generation — pure function that produces structured content
 * from a user's positions, plans, and market data. Callers decide what to do
 * with the content (send email, persist, render in UI).
 */

import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getMultipleQuotes } from "@/lib/market/yahoo"

// ── Types ────────────────────────────────────────────────

export interface DigestPosition {
  symbol: string
  quantity: number
  averageCost: number
  currentPrice: number
  dayChangePct: number
  marketValue: number
  unrealizedPnL: number
  unrealizedPnLPct: number
}

export interface DigestActionItem {
  severity: "info" | "warning" | "urgent"
  type: string
  symbol: string
  title: string
  body: string
  actionUrl?: string
}

export interface DigestRiskRow {
  id: string
  title: string
  score: number | null
  previousScore: number | null
  delta: number | null
  summary: string | null
}

export interface DigestContent {
  date: string // YYYY-MM-DD in user tz
  portfolio: {
    totalValue: number
    dayChange: number
    dayChangePct: number
    positionCount: number
  }
  topMovers: {
    gainers: DigestPosition[]
    losers: DigestPosition[]
  }
  actionRequired: DigestActionItem[]
  positionsWithoutPlans: string[]
  positions: DigestPosition[]
  risks: DigestRiskRow[]
}

// ── Service-role client (bypasses RLS for cron) ─────────

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

// ── Core ─────────────────────────────────────────────────

export async function generateDigestForUser(userId: string): Promise<DigestContent> {
  const supabase = serviceClient()

  // 1. Load open positions
  const { data: rawPositions } = await supabase
    .from("portfolio_positions")
    .select("symbol, quantity, average_cost")
    .eq("user_id", userId)
    .is("closed_at", null)

  const positionRows = rawPositions ?? []

  // Aggregate by symbol (user may have same ticker in multiple accounts)
  const bySymbol = new Map<string, { quantity: number; totalCost: number }>()
  for (const p of positionRows) {
    const qty = Number(p.quantity)
    const avg = Number(p.average_cost)
    if (!Number.isFinite(qty) || qty === 0) continue
    const agg = bySymbol.get(p.symbol) ?? { quantity: 0, totalCost: 0 }
    agg.quantity += qty
    agg.totalCost += qty * avg
    bySymbol.set(p.symbol, agg)
  }

  const symbols = Array.from(bySymbol.keys())

  // 2. Load plans
  const { data: plansData } = await supabase
    .from("position_plans")
    .select("*")
    .eq("user_id", userId)
  const plans = plansData ?? []
  const planBySymbol = new Map(plans.map((p) => [p.symbol, p]))

  // 3. Load quotes (skip if no positions)
  const quotes = symbols.length > 0 ? await getMultipleQuotes(symbols) : []
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]))

  // 4. Build per-position digest rows
  const positions: DigestPosition[] = []
  for (const [symbol, agg] of bySymbol) {
    const quote = quoteBySymbol.get(symbol)
    const price = quote?.regularMarketPrice ?? 0
    const avgCost = agg.quantity > 0 ? agg.totalCost / agg.quantity : 0
    const mv = agg.quantity * price
    const pnl = mv - agg.totalCost
    positions.push({
      symbol,
      quantity: agg.quantity,
      averageCost: avgCost,
      currentPrice: price,
      dayChangePct: quote?.regularMarketChangePercent ?? 0,
      marketValue: mv,
      unrealizedPnL: pnl,
      unrealizedPnLPct: agg.totalCost > 0 ? (pnl / agg.totalCost) * 100 : 0,
    })
  }

  // 5. Portfolio summary
  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0)
  const prevValue = positions.reduce(
    (s, p) => s + p.quantity * (p.currentPrice / (1 + p.dayChangePct / 100 || 1)), 0)
  const dayChange = totalValue - prevValue
  const dayChangePct = prevValue > 0 ? (dayChange / prevValue) * 100 : 0

  // 6. Top movers (need ≥2 positions for this to be meaningful)
  const sorted = [...positions].sort((a, b) => b.dayChangePct - a.dayChangePct)
  const gainers = sorted.filter((p) => p.dayChangePct > 0).slice(0, 3)
  const losers = sorted.filter((p) => p.dayChangePct < 0).slice(-3).reverse()

  // 7. Evaluate plan triggers → action items
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const actionRequired: DigestActionItem[] = []
  for (const plan of plans) {
    const pos = positions.find((p) => p.symbol === plan.symbol)
    if (!pos) continue

    // Target hit
    if (plan.target_price && pos.currentPrice >= Number(plan.target_price)) {
      actionRequired.push({
        severity: "urgent",
        type: "plan_target_hit",
        symbol: plan.symbol,
        title: `${plan.symbol} target hit`,
        body: `Current $${pos.currentPrice.toFixed(2)} is at or above target $${Number(plan.target_price).toFixed(2)}. Review plan.`,
        actionUrl: `/stock/${plan.symbol}`,
      })
    } else if (plan.target_price && pos.currentPrice >= Number(plan.target_price) * 0.95) {
      // Within 5% of target
      actionRequired.push({
        severity: "info",
        type: "plan_target_near",
        symbol: plan.symbol,
        title: `${plan.symbol} approaching target`,
        body: `Current $${pos.currentPrice.toFixed(2)} is within 5% of target $${Number(plan.target_price).toFixed(2)}.`,
        actionUrl: `/stock/${plan.symbol}`,
      })
    }

    // Stop breached / threatened
    if (plan.stop_price && pos.currentPrice <= Number(plan.stop_price)) {
      actionRequired.push({
        severity: "urgent",
        type: "plan_stop_hit",
        symbol: plan.symbol,
        title: `${plan.symbol} STOP breached`,
        body: `Current $${pos.currentPrice.toFixed(2)} is at or below stop $${Number(plan.stop_price).toFixed(2)}. Your plan says exit.`,
        actionUrl: `/stock/${plan.symbol}`,
      })
    } else if (plan.stop_price && pos.currentPrice <= Number(plan.stop_price) * 1.05) {
      actionRequired.push({
        severity: "warning",
        type: "plan_stop_threatened",
        symbol: plan.symbol,
        title: `${plan.symbol} near stop`,
        body: `Current $${pos.currentPrice.toFixed(2)} is within 5% of stop $${Number(plan.stop_price).toFixed(2)}.`,
        actionUrl: `/stock/${plan.symbol}`,
      })
    }

    // Review date reached
    if (plan.review_next_date) {
      const reviewDate = new Date(plan.review_next_date)
      reviewDate.setHours(0, 0, 0, 0)
      if (reviewDate <= today) {
        actionRequired.push({
          severity: "info",
          type: "plan_review_due",
          symbol: plan.symbol,
          title: `${plan.symbol} plan review due`,
          body: `Scheduled review: ${plan.review_next_date}. Check thesis still holds.`,
          actionUrl: `/stock/${plan.symbol}`,
        })
      }
    }
  }

  // 8. Positions without plans
  const positionsWithoutPlans = symbols.filter((s) => !planBySymbol.has(s))

  // 9. Risks: most recent two scores per active monitor → row with delta
  const { data: monitors } = await supabase
    .from("risk_monitors")
    .select("id, title, latest_score, latest_score_at")
    .eq("user_id", userId)
    .eq("is_active", true)

  const risks: DigestRiskRow[] = []
  for (const m of monitors ?? []) {
    const { data: recent } = await supabase
      .from("risk_scores")
      .select("score, summary, computed_at")
      .eq("monitor_id", m.id)
      .order("computed_at", { ascending: false })
      .limit(2)

    const latest = recent?.[0]
    const prev = recent?.[1]
    risks.push({
      id: m.id,
      title: m.title,
      score: latest ? Number(latest.score) : (m.latest_score != null ? Number(m.latest_score) : null),
      previousScore: prev ? Number(prev.score) : null,
      delta: latest && prev ? Number(latest.score) - Number(prev.score) : null,
      summary: latest?.summary ?? null,
    })
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    portfolio: {
      totalValue,
      dayChange,
      dayChangePct,
      positionCount: positions.length,
    },
    topMovers: { gainers, losers },
    actionRequired,
    positionsWithoutPlans,
    positions,
    risks,
  }
}

// ── Persist digest + create inbox items ─────────────────

export async function persistDigest(userId: string, content: DigestContent) {
  const supabase = serviceClient()

  // Upsert digest_runs (one per user per day)
  await supabase.from("digest_runs").upsert(
    { user_id: userId, digest_date: content.date, content },
    { onConflict: "user_id,digest_date" },
  )

  // Create inbox items from action items (skip if already exists today for same type+symbol)
  for (const item of content.actionRequired) {
    const { data: existing } = await supabase
      .from("inbox_items")
      .select("id")
      .eq("user_id", userId)
      .eq("type", item.type)
      .eq("symbol", item.symbol)
      .gte("created_at", `${content.date}T00:00:00Z`)
      .limit(1)

    if (existing && existing.length > 0) continue

    await supabase.from("inbox_items").insert({
      user_id: userId,
      type: item.type,
      severity: item.severity,
      title: item.title,
      body: item.body,
      symbol: item.symbol,
      action_url: item.actionUrl,
    })
  }
}

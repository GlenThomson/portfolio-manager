import { generateText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { searchGoogleNews } from "../news-search"
import type { MonitorContext, ProviderResult } from "./types"

const gemini = createOpenAICompatible({
  name: "gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
})
const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY ?? "",
})
const useGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
function getModel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useGemini
    ? (gemini.chatModel("gemini-2.5-flash") as any)
    : (groq.chatModel("llama-3.3-70b-versatile") as any)
}

interface IncursionReport {
  date: string         // YYYY-MM-DD the report is about
  aircraft: number
  vessels: number
  crossedMedianLine: boolean
  sourceUrl: string
  sourceTitle: string
}

/**
 * Taiwan-specific Tier 3 provider.
 *
 * Data source: Taiwan's MND publishes daily PLA-activity press releases. These are
 * widely reported by Focus Taiwan (CNA English), Taipei Times, Reuters, Taiwan News.
 * Each press release states how many PLA aircraft and vessels were detected around
 * Taiwan in the previous 24 hours.
 *
 * We fetch recent news headlines likely to contain these numbers, then use the AI
 * to extract structured incursion counts. We score risk based on how elevated
 * recent incursions are vs. a rough baseline (~10-20 aircraft is routine, 30+
 * is elevated, 70+ is acute, 100+ is extraordinary like a drill).
 */
export async function runTaiwanIncursionsProvider(ctx: MonitorContext): Promise<ProviderResult> {
  try {
    // Search specifically for daily-report headlines. MND / Focus Taiwan / CNA
    // publish these predictably. Multiple queries increases hit rate.
    const queries = [
      "PLA aircraft Taiwan ADIZ",
      "Chinese warplanes Taiwan",
      "PLAN vessels Taiwan",
      "Taiwan MND detected Chinese",
    ]

    const headlineSets = await Promise.all(
      queries.map((q) => searchGoogleNews(q, { limit: 12, lookbackDays: 14 }).catch(() => [])),
    )
    const byUrl = new Map<string, { title: string; url: string; source: string; publishedAt: string }>()
    for (const set of headlineSets) {
      for (const h of set) {
        if (!byUrl.has(h.url)) byUrl.set(h.url, h)
      }
    }
    const headlines = Array.from(byUrl.values()).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))

    if (headlines.length === 0) {
      return {
        key: "taiwan_incursions",
        score: 0,
        weight: 0,
        summary: "No recent Taiwan incursion reports found.",
        data: { reports: [], baseline: null, recentAvg: null },
      }
    }

    // Feed to AI for structured extraction
    const numbered = headlines.slice(0, 30)
      .map((h, i) => `${i + 1}. [${h.publishedAt.slice(0, 10)}] [${h.source}] ${h.title}`)
      .join("\n")

    const prompt = `You are extracting PLA military activity data from news headlines. Output STRICT JSON — no prose, no markdown.

HEADLINES (each may or may not contain incursion counts):
${numbered}

For headlines that explicitly mention Taiwan MND's daily PLA aircraft/vessel count around Taiwan, extract:
- report_date: the 24-hour period the headline is about (YYYY-MM-DD). If headline says "today" use the publish date; if "yesterday" use publish date minus 1.
- aircraft: number of PLA aircraft detected (integer)
- vessels: number of PLAN vessels detected (integer, 0 if not mentioned)
- crossed_median: true if the headline explicitly mentions crossing the Taiwan Strait median line
- headline_index: the number of the headline (1-based)

Skip headlines that don't report counts. Deduplicate: if multiple headlines report the same date, keep the one with the higher aircraft count.

Output JSON exactly:
{
  "reports": [
    { "report_date": "YYYY-MM-DD", "aircraft": number, "vessels": number, "crossed_median": boolean, "headline_index": number }
  ]
}

Only include reports where you could extract an aircraft count. JSON only.`

    const { text } = await generateText({ model: getModel(), prompt, temperature: 0.1 })
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim()
    let parsed: { reports: Array<{ report_date: string; aircraft: number; vessels: number; crossed_median: boolean; headline_index: number }> }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { reports: [] }
    }

    const reports: IncursionReport[] = (parsed.reports ?? []).map((r) => {
      const h = headlines[Math.max(0, (r.headline_index ?? 1) - 1)]
      return {
        date: r.report_date,
        aircraft: Math.max(0, Math.round(Number(r.aircraft) || 0)),
        vessels: Math.max(0, Math.round(Number(r.vessels) || 0)),
        crossedMedianLine: !!r.crossed_median,
        sourceUrl: h?.url ?? "",
        sourceTitle: h?.title ?? "",
      }
    }).filter((r) => r.aircraft >= 1)

    // Dedupe by date, keep highest aircraft count
    const byDate = new Map<string, IncursionReport>()
    for (const r of reports) {
      const existing = byDate.get(r.date)
      if (!existing || r.aircraft > existing.aircraft) byDate.set(r.date, r)
    }
    const uniqueReports = Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1))

    if (uniqueReports.length === 0) {
      return {
        key: "taiwan_incursions",
        score: 0,
        weight: 0,
        summary: "No structured incursion counts in recent headlines.",
        data: { reports: [], baseline: null, recentAvg: null, rawHeadlines: headlines.slice(0, 5) },
      }
    }

    // Compute last 7d average vs. the 14-day baseline from this window
    const recent7 = uniqueReports.slice(0, 7)
    const recentAvg = recent7.reduce((s, r) => s + r.aircraft, 0) / recent7.length
    const baselineReports = uniqueReports.slice(0, 14)
    const baseline = baselineReports.reduce((s, r) => s + r.aircraft, 0) / baselineReports.length
    const maxRecent = Math.max(...recent7.map((r) => r.aircraft))

    // Score thresholds:
    //   recentAvg 0-10: low (0-20)
    //   10-20: baseline routine grey zone ops (20-40)
    //   20-35: elevated (40-65)
    //   35-60: high (65-85)
    //   60+ or any day 80+: acute (85-100)
    let score: number
    if (maxRecent >= 100) score = 100
    else if (maxRecent >= 80 || recentAvg >= 60) score = Math.min(100, 85 + (recentAvg - 60))
    else if (recentAvg >= 35) score = 65 + Math.round((recentAvg - 35) / 25 * 20)
    else if (recentAvg >= 20) score = 40 + Math.round((recentAvg - 20) / 15 * 25)
    else if (recentAvg >= 10) score = 20 + Math.round((recentAvg - 10) / 10 * 20)
    else score = Math.round(recentAvg * 2)
    score = Math.max(0, Math.min(100, Math.round(score)))

    const crossedCount = recent7.filter((r) => r.crossedMedianLine).length
    const trend = recentAvg > baseline * 1.3 ? "↑ trending up" : recentAvg < baseline * 0.7 ? "↓ easing" : "stable"

    const summary =
      `Last 7d avg: ${recentAvg.toFixed(1)} aircraft/day (baseline ${baseline.toFixed(1)}, ${trend}). ` +
      `Peak this week: ${maxRecent}` +
      (crossedCount > 0 ? `. Median-line crossings: ${crossedCount} day(s).` : ".")

    return {
      key: "taiwan_incursions",
      score,
      weight: 0.25,
      summary,
      data: {
        reports: uniqueReports,
        recentAvg,
        baseline,
        maxRecent,
        crossedMedianDays: crossedCount,
      },
    }
  } catch (err) {
    return {
      key: "taiwan_incursions",
      score: 0,
      weight: 0,
      summary: "Taiwan incursions provider failed",
      data: { reports: [] },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

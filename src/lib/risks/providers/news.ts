import { searchMultipleQueries } from "../news-search"
import { scoreHeadlinesForRisk } from "../ai-scorer"
import type { MonitorContext, ProviderResult } from "./types"

export async function runNewsProvider(ctx: MonitorContext): Promise<ProviderResult> {
  try {
    const queries = ctx.keywords.length > 0 ? ctx.keywords : [ctx.title]
    const headlines = await searchMultipleQueries(queries, { limitPerQuery: 10, lookbackDays: 7 })

    // No headlines fetched — likely network/rate-limit issue. Don't dilute composite.
    if (headlines.length === 0) {
      return {
        key: "news",
        score: 0,
        weight: 0,
        summary: "No headlines fetched (Google News may be rate-limiting or no results for these keywords).",
        data: { headlines: [], fetchedCount: 0 },
      }
    }

    const result = await scoreHeadlinesForRisk(ctx.title, ctx.description ?? "", headlines)

    // AI scoring failed — exclude from composite rather than dragging it down.
    if (result.summary.startsWith("Scoring failed") || result.summary.startsWith("AI scoring failed")) {
      return {
        key: "news",
        score: 0,
        weight: 0,
        summary: `${result.summary} (${headlines.length} headlines fetched but AI didn't score them).`,
        data: { headlines: [], fetchedCount: headlines.length },
      }
    }

    return {
      key: "news",
      score: result.score,
      weight: 0.40,
      summary: result.summary,
      data: {
        headlines: result.headlines,
        fetchedCount: headlines.length,
      },
    }
  } catch (err) {
    return {
      key: "news",
      score: 0,
      weight: 0,
      summary: "News provider failed",
      data: {},
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

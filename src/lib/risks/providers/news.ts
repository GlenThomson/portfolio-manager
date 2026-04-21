import { searchMultipleQueries } from "../news-search"
import { scoreHeadlinesForRisk } from "../ai-scorer"
import type { MonitorContext, ProviderResult } from "./types"

export async function runNewsProvider(ctx: MonitorContext): Promise<ProviderResult> {
  try {
    const queries = ctx.keywords.length > 0 ? ctx.keywords : [ctx.title]
    const headlines = await searchMultipleQueries(queries, { limitPerQuery: 10, lookbackDays: 7 })
    const result = await scoreHeadlinesForRisk(ctx.title, ctx.description ?? "", headlines)

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

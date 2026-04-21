import type { MonitorContext, ProviderResult } from "./types"

interface PolymarketContract {
  id: string
  question: string
  slug: string
  url: string
  yesPrice: number      // 0-1, implied probability of YES
  volume: number
  endDate?: string | null
  resolved?: boolean
}

// Polymarket's public Gamma API
// Docs: https://docs.polymarket.com/ (gamma-api)
const GAMMA_URL = "https://gamma-api.polymarket.com"

/**
 * Search Polymarket for markets relevant to a risk monitor.
 * Uses the monitor's keywords + title as search queries.
 * Aggregates implied probabilities into a 0-100 risk score.
 */
export async function runPolymarketProvider(ctx: MonitorContext): Promise<ProviderResult> {
  try {
    // Build a shortlist of search terms. Polymarket's `q` param does fuzzy text match
    // on question text. Use title + first 2 keywords to avoid overfiring.
    const terms = [ctx.title, ...ctx.keywords.slice(0, 2)]
      .map((t) => t.trim())
      .filter((t, i, arr) => t.length > 0 && arr.indexOf(t) === i)

    const contractsByUrl = new Map<string, PolymarketContract>()

    for (const term of terms) {
      const url = `${GAMMA_URL}/markets?closed=false&active=true&limit=20&q=${encodeURIComponent(term)}`
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (PortfolioAI)" },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const list = await res.json()
      if (!Array.isArray(list)) continue

      for (const m of list) {
        // Skip non-binary or malformed
        const outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes
        const prices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices
        if (!Array.isArray(outcomes) || !Array.isArray(prices) || outcomes.length < 2) continue

        // Find the YES index. Most Polymarket binary markets have ["Yes", "No"].
        const yesIdx = outcomes.findIndex((o: string) => /^yes$/i.test(o))
        if (yesIdx < 0) continue
        const yesPrice = Number(prices[yesIdx])
        if (!Number.isFinite(yesPrice)) continue

        const slug: string = m.slug ?? ""
        const question: string = m.question ?? m.title ?? slug
        const marketUrl = slug ? `https://polymarket.com/event/${slug}` : `https://polymarket.com`
        if (contractsByUrl.has(marketUrl)) continue

        contractsByUrl.set(marketUrl, {
          id: String(m.id ?? slug),
          question,
          slug,
          url: marketUrl,
          yesPrice,
          volume: Number(m.volume ?? 0),
          endDate: m.endDate ?? null,
          resolved: !!m.closed,
        })
      }
    }

    const contracts = Array.from(contractsByUrl.values())
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)

    if (contracts.length === 0) {
      return {
        key: "polymarket",
        score: 0,
        weight: 0,
        summary: "No relevant Polymarket contracts found.",
        data: { contracts: [] },
      }
    }

    // Score: weighted average of YES probabilities, weighted by volume.
    // Most "bad thing happens" markets phrase YES as the bad outcome, so YES price ≈ implied risk.
    // We output 0-100 (yesPrice × 100).
    const totalVol = contracts.reduce((s, c) => s + Math.max(c.volume, 1), 0)
    const weightedAvg = contracts.reduce(
      (s, c) => s + c.yesPrice * Math.max(c.volume, 1),
      0,
    ) / totalVol

    const score = Math.round(weightedAvg * 100)

    const top = contracts[0]
    const summary = `Polymarket implies ${(top.yesPrice * 100).toFixed(0)}% — "${top.question.slice(0, 80)}${top.question.length > 80 ? "…" : ""}" (${contracts.length} markets tracked).`

    return {
      key: "polymarket",
      score,
      weight: 0.15,
      summary,
      data: { contracts, weightedProbability: weightedAvg },
    }
  } catch (err) {
    return {
      key: "polymarket",
      score: 0,
      weight: 0,
      summary: "Polymarket provider failed",
      data: { contracts: [] },
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

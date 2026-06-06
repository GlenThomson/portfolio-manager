/**
 * Polymarket Gamma API client — fetches active markets and filters them per
 * the user's rules. Free, no auth required.
 *
 * Gamma docs: https://docs.polymarket.com/developers/gamma-api/get-events
 */

const GAMMA_URL = "https://gamma-api.polymarket.com"

export interface PolymarketMarket {
  id: string
  slug: string
  question: string
  category: string | null
  yesPrice: number          // 0-1 implied probability of YES
  noPrice: number
  volume24h: number
  volumeTotal: number
  liquidity: number
  endDate: string | null
  marketUrl: string
  outcomes: string[]
  raw: Record<string, unknown>
}

export interface MarketFilters {
  minVolume?: number          // 24h
  minLiquidity?: number
  minPositionUsd?: number     // skip markets where $X would move the price too much
  maxEndDateDays?: number
  minEndDateDays?: number
  maxSpread?: number          // max bid-ask spread as fraction (e.g. 0.04 = 4¢)
  excludedCategories?: string[]
  preferredCategories?: string[]
}

function parseJsonField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try { return JSON.parse(value) } catch { return [] }
  }
  return []
}

function categoryOf(market: Record<string, unknown>): string | null {
  // Polymarket has had various category fields over time
  if (typeof market.category === "string") return market.category
  const tags = parseJsonField(market.tags)
  if (tags.length > 0 && typeof tags[0] === "object" && tags[0] !== null) {
    const t = tags[0] as { label?: string; slug?: string }
    return t.label ?? t.slug ?? null
  }
  return null
}

/**
 * Fetch active markets from Polymarket's Gamma API. Paginates if needed.
 * Returns normalised PolymarketMarket objects.
 */
export async function fetchActiveMarkets(opts: { limit?: number } = {}): Promise<PolymarketMarket[]> {
  const limit = opts.limit ?? 200
  // Gamma supports limit + offset pagination
  const url = `${GAMMA_URL}/markets?closed=false&active=true&limit=${limit}&order=volume24hr&ascending=false`

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (PortfolioAI)" },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    throw new Error(`Polymarket fetch failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error("Polymarket returned non-array response")
  }

  const markets: PolymarketMarket[] = []
  for (const m of data) {
    if (typeof m !== "object" || m === null) continue
    const row = m as Record<string, unknown>

    const outcomes = parseJsonField(row.outcomes).filter((o): o is string => typeof o === "string")
    const prices = parseJsonField(row.outcomePrices).map((p) => Number(p)).filter((p) => Number.isFinite(p))
    if (outcomes.length < 2 || prices.length < 2) continue

    const yesIdx = outcomes.findIndex((o) => /^yes$/i.test(o))
    if (yesIdx < 0) continue
    const noIdx = outcomes.findIndex((o) => /^no$/i.test(o))
    const yesPrice = prices[yesIdx]
    const noPrice = noIdx >= 0 ? prices[noIdx] : 1 - yesPrice
    if (!Number.isFinite(yesPrice)) continue

    const slug = typeof row.slug === "string" ? row.slug : ""
    markets.push({
      id: String(row.id ?? slug),
      slug,
      question: (typeof row.question === "string" ? row.question : (typeof row.title === "string" ? row.title : slug)) || "",
      category: categoryOf(row),
      yesPrice,
      noPrice,
      volume24h: Number(row.volume24hr ?? row.volume24Hr ?? 0),
      volumeTotal: Number(row.volume ?? 0),
      liquidity: Number(row.liquidity ?? 0),
      endDate: typeof row.endDate === "string" ? row.endDate : (typeof row.end_date_iso === "string" ? row.end_date_iso : null),
      marketUrl: slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com",
      outcomes,
      raw: row,
    })
  }

  return markets
}

/**
 * Apply the user's filters. Returns markets that pass all checks.
 */
export function filterMarkets(markets: PolymarketMarket[], filters: MarketFilters): PolymarketMarket[] {
  const now = Date.now()
  const minVolume = filters.minVolume ?? 0
  const minLiquidity = filters.minLiquidity ?? 0
  const minPositionUsd = filters.minPositionUsd ?? 0
  const maxEndMs = filters.maxEndDateDays != null ? now + filters.maxEndDateDays * 86400_000 : Infinity
  const minEndMs = filters.minEndDateDays != null ? now + filters.minEndDateDays * 86400_000 : 0
  const maxSpread = filters.maxSpread ?? 1
  const excluded = new Set((filters.excludedCategories ?? []).map((c) => c.toLowerCase()))

  return markets.filter((m) => {
    if (m.volume24h < minVolume) return false
    if (m.liquidity < minLiquidity) return false
    // Approximate impact: a $minPositionUsd buy on YES would shift price by ~minPositionUsd/liquidity
    // Skip if that move is >5% of the price (so $100 on a $0.10 market needs liquidity > $20k)
    if (minPositionUsd > 0 && m.liquidity > 0) {
      const impactPct = minPositionUsd / m.liquidity
      if (impactPct > 0.05) return false
    }
    if (m.endDate) {
      const end = Date.parse(m.endDate)
      if (Number.isFinite(end)) {
        if (end < minEndMs) return false
        if (end > maxEndMs) return false
      }
    }
    // Spread = absolute difference between yes + no from a perfectly priced book (=1).
    // If yesPrice + noPrice > 1 + maxSpread, the spread is too wide.
    const spread = Math.abs((m.yesPrice + m.noPrice) - 1)
    if (spread > maxSpread) return false
    if (m.category && excluded.has(m.category.toLowerCase())) return false
    return true
  })
}

export { GAMMA_URL }

/**
 * Polymarket Data API client — fetches user positions and trades by wallet
 * address (read-only, public on-chain data, no auth needed).
 *
 * API: https://docs.polymarket.com/developers/users-data-api
 */

const DATA_URL = "https://data-api.polymarket.com"

export interface PolymarketPosition {
  marketId: string         // condition id or token id
  asset: string            // token address
  question: string
  outcome: string          // "Yes" | "No" (the side this position is on)
  size: number             // shares held
  avgPrice: number         // average entry price (0-1)
  currentPrice: number     // latest mark price (0-1)
  currentValue: number     // size * currentPrice (in USD)
  initialValue: number     // size * avgPrice
  unrealizedPnl: number    // currentValue - initialValue
  percentPnl: number
  endDate: string | null
  category: string | null
  slug: string | null
}

export interface PolymarketTrade {
  marketId: string
  asset: string
  question: string
  outcome: string
  side: "BUY" | "SELL"
  size: number
  price: number
  totalUsd: number
  timestamp: string        // ISO
}

function safeJsonParse<T>(text: string): T | null {
  try { return JSON.parse(text) as T } catch { return null }
}

/**
 * Fetch open positions for a wallet.
 * Returns up to 500 positions; should be plenty for retail accounts.
 */
export async function fetchUserPositions(walletAddress: string): Promise<PolymarketPosition[]> {
  const url = `${DATA_URL}/positions?user=${encodeURIComponent(walletAddress.toLowerCase())}&sizeThreshold=0.01&limit=500`
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (PortfolioAI)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    throw new Error(`Polymarket positions fetch failed: ${res.status}`)
  }
  const text = await res.text()
  const data = safeJsonParse<Array<Record<string, unknown>>>(text)
  if (!Array.isArray(data)) return []

  return data.map((p) => {
    const size = Number(p.size ?? 0)
    const avgPrice = Number(p.avgPrice ?? 0)
    const currentPrice = Number(p.curPrice ?? p.currentPrice ?? avgPrice)
    const currentValue = Number(p.currentValue ?? size * currentPrice)
    const initialValue = Number(p.initialValue ?? size * avgPrice)
    return {
      marketId: String(p.conditionId ?? p.market ?? p.asset ?? ""),
      asset: String(p.asset ?? ""),
      question: String(p.title ?? p.eventTitle ?? ""),
      outcome: String(p.outcome ?? ""),
      size,
      avgPrice,
      currentPrice,
      currentValue,
      initialValue,
      unrealizedPnl: Number(p.cashPnl ?? (currentValue - initialValue)),
      percentPnl: Number(p.percentPnl ?? (initialValue > 0 ? ((currentValue - initialValue) / initialValue) * 100 : 0)),
      endDate: typeof p.endDate === "string" ? p.endDate : null,
      category: typeof p.category === "string" ? p.category : null,
      slug: typeof p.slug === "string" ? p.slug : (typeof p.eventSlug === "string" ? p.eventSlug : null),
    }
  })
}

/**
 * Fetch recent trades for a wallet.
 */
export async function fetchUserTrades(walletAddress: string, opts: { limit?: number } = {}): Promise<PolymarketTrade[]> {
  const limit = opts.limit ?? 200
  const url = `${DATA_URL}/trades?user=${encodeURIComponent(walletAddress.toLowerCase())}&limit=${limit}`
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (PortfolioAI)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    throw new Error(`Polymarket trades fetch failed: ${res.status}`)
  }
  const text = await res.text()
  const data = safeJsonParse<Array<Record<string, unknown>>>(text)
  if (!Array.isArray(data)) return []

  return data.map((t) => {
    const size = Number(t.size ?? 0)
    const price = Number(t.price ?? 0)
    const sideRaw = String(t.side ?? "").toUpperCase()
    return {
      marketId: String(t.conditionId ?? t.market ?? ""),
      asset: String(t.asset ?? ""),
      question: String(t.title ?? t.eventTitle ?? ""),
      outcome: String(t.outcome ?? ""),
      side: sideRaw === "SELL" ? "SELL" : "BUY",
      size,
      price,
      totalUsd: Number(t.usdcSize ?? size * price),
      timestamp: typeof t.timestamp === "string"
        ? t.timestamp
        : (typeof t.timestamp === "number" ? new Date(t.timestamp * 1000).toISOString() : new Date().toISOString()),
    }
  })
}

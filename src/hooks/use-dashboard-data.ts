"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

interface Portfolio {
  id: string
  name: string
  is_paper: boolean
}

interface Position {
  symbol: string
  quantity: string
  average_cost: string
  portfolio_id: string
  asset_type?: string
}

interface WatchlistQuote {
  symbol: string
  shortName: string
  price: number
  change: number
  changePct: number
}

interface Transaction {
  id: string
  symbol: string
  action: string
  quantity: string
  price: string
  executed_at: string
  portfolio_id: string
}

interface MarketNewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: string
  thumbnail: string | null
}

export interface DashboardData {
  portfolios: Portfolio[]
  positions: Position[]
  quotes: Record<string, { price: number; change: number; changePct: number }>
  watchlistQuotes: WatchlistQuote[]
  transactions: Transaction[]
}

async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { portfolios: [], positions: [], quotes: {}, watchlistQuotes: [], transactions: [] }

  const [portfolioRes, positionsRes, watchlistRes, transactionsRes] = await Promise.all([
    supabase.from("portfolios").select("id, name, is_paper").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("portfolio_positions").select("symbol, quantity, average_cost, portfolio_id, asset_type").eq("user_id", user.id).is("closed_at", null),
    supabase.from("watchlists").select("symbols").eq("user_id", user.id).limit(1).single(),
    supabase.from("transactions").select("id, symbol, action, quantity, price, executed_at, portfolio_id").eq("user_id", user.id).order("executed_at", { ascending: false }).limit(5),
  ])

  const portfolios = portfolioRes.data ?? []
  const positions = positionsRes.data ?? []
  const transactions = transactionsRes.data ?? []

  const stockPositions = positions.filter((p: { asset_type?: string }) => p.asset_type !== "cash")
  const posSymbols = Array.from(new Set(stockPositions.map((p) => p.symbol)))
  const watchSymbols: string[] = watchlistRes.data?.symbols ?? []
  const allSymbols = Array.from(new Set([...posSymbols, ...watchSymbols.slice(0, 10)]))

  const quotes: Record<string, { price: number; change: number; changePct: number }> = {}
  let watchlistQuotes: WatchlistQuote[] = []

  if (allSymbols.length > 0) {
    try {
      const res = await fetch(`/api/market/quote?symbols=${allSymbols.join(",")}`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : [data]
        list.forEach((q: { symbol: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; shortName?: string }) => {
          quotes[q.symbol] = {
            price: q.regularMarketPrice,
            change: q.regularMarketChange,
            changePct: q.regularMarketChangePercent,
          }
        })
        list.forEach((q: { symbol: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; shortName?: string }) => {
          if (watchSymbols.includes(q.symbol)) {
            watchlistQuotes.push({
              symbol: q.symbol,
              shortName: q.shortName ?? q.symbol,
              price: q.regularMarketPrice,
              change: q.regularMarketChange,
              changePct: q.regularMarketChangePercent,
            })
          }
        })
        watchlistQuotes = watchlistQuotes.slice(0, 5)
      }
    } catch {}
  }

  return { portfolios, positions, quotes, watchlistQuotes, transactions }
}

export function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    staleTime: 2 * 60 * 1000, // 2 min for dashboard
  })
}

async function fetchMarketNews(): Promise<MarketNewsItem[]> {
  try {
    const res = await fetch("/api/market/news?category=general")
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) return data.slice(0, 5)
    }
  } catch {}
  return []
}

export function useMarketNews() {
  return useQuery({
    queryKey: ["market-news"],
    queryFn: fetchMarketNews,
    staleTime: 5 * 60 * 1000, // news can be stale for 5 min
  })
}

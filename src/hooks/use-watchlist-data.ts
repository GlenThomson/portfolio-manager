"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

export interface WatchlistItem {
  symbol: string
  shortName: string
  price: number
  change: number
  changePct: number
  sparklineData: { time: number; value: number }[]
}

interface WatchlistMeta {
  id: string | null
  symbols: string[]
}

async function fetchWatchlistMeta(): Promise<WatchlistMeta> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, symbols: [] }

  const { data } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .single()

  return { id: data?.id ?? null, symbols: data?.symbols ?? [] }
}

async function fetchWatchlistQuotes(symbols: string[]): Promise<Record<string, WatchlistItem>> {
  if (symbols.length === 0) return {}

  try {
    const symbolList = symbols.join(",")
    const [quotesRes, ...chartResponses] = await Promise.all([
      fetch(`/api/market/quote?symbols=${symbolList}`),
      ...symbols.map((s) =>
        fetch(`/api/market/chart?symbol=${s}&period=5d&interval=15m`)
      ),
    ])

    const quotesData = await quotesRes.json()
    const quotes = Array.isArray(quotesData) ? quotesData : [quotesData]

    const chartDataMap: Record<string, { time: number; value: number }[]> = {}
    for (let i = 0; i < symbols.length; i++) {
      try {
        const chartData = await chartResponses[i].json()
        chartDataMap[symbols[i]] = chartData
          .filter((d: { time: number; close: number }) => d.close > 0)
          .map((d: { time: number; close: number }) => ({
            time: d.time,
            value: d.close,
          }))
      } catch {
        chartDataMap[symbols[i]] = []
      }
    }

    const map: Record<string, WatchlistItem> = {}
    for (const q of quotes) {
      const sym = q.symbol as string
      map[sym] = {
        symbol: sym,
        shortName: q.shortName as string,
        price: q.regularMarketPrice as number,
        change: q.regularMarketChange as number,
        changePct: q.regularMarketChangePercent as number,
        sparklineData: chartDataMap[sym] ?? [],
      }
    }
    return map
  } catch {
    return {}
  }
}

export function useWatchlistMeta() {
  return useQuery({
    queryKey: ["watchlist-meta"],
    queryFn: fetchWatchlistMeta,
  })
}

export function useWatchlistQuotes(symbols: string[]) {
  return useQuery({
    queryKey: ["watchlist-quotes"],
    queryFn: () => fetchWatchlistQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Fetch quote + chart for a single symbol.
 * Used when adding to watchlist so we don't refetch everything.
 */
export async function fetchSingleQuote(symbol: string): Promise<WatchlistItem | null> {
  try {
    const [quotesRes, chartRes] = await Promise.all([
      fetch(`/api/market/quote?symbols=${symbol}`),
      fetch(`/api/market/chart?symbol=${symbol}&period=5d&interval=15m`),
    ])

    const q = await quotesRes.json()
    const chartData = await chartRes.json()

    const sparklineData = Array.isArray(chartData)
      ? chartData
          .filter((d: { time: number; close: number }) => d.close > 0)
          .map((d: { time: number; close: number }) => ({ time: d.time, value: d.close }))
      : []

    return {
      symbol: q.symbol,
      shortName: q.shortName,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
      sparklineData,
    }
  } catch {
    return null
  }
}

"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { StockChart } from "@/components/charts/stock-chart"
import { Button } from "@/components/ui/button"
import { Star, Plus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { cn } from "@/lib/utils"
import type { Quote, OHLC } from "@/types/market"

function formatNum(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function formatVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

export default function StockDetailPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [chartData, setChartData] = useState<OHLC[]>([])
  const [activeInterval, setActiveInterval] = useState("1d")
  const [activePeriod, setActivePeriod] = useState("6mo")
  const [loading, setLoading] = useState(true)
  const [inWatchlist, setInWatchlist] = useState(false)
  const [watchlistLoading, setWatchlistLoading] = useState(false)
  const loadingMoreRef = useRef(false)

  const handleLoadMore = useCallback(async (beforeTimestamp: number) => {
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    try {
      const res = await fetch(
        `/api/market/chart?symbol=${symbol}&period=${activePeriod}&interval=${activeInterval}&before=${beforeTimestamp}`
      )
      if (!res.ok) return
      const olderData: OHLC[] = await res.json()
      if (olderData.length === 0) return

      setChartData((prev) => {
        const existingTimes = new Set(prev.map((d) => d.time))
        const newPoints = olderData.filter((d) => !existingTimes.has(d.time))
        if (newPoints.length === 0) return prev
        return [...newPoints, ...prev].sort((a, b) => a.time - b.time)
      })
    } catch {
      // ignore
    } finally {
      loadingMoreRef.current = false
    }
  }, [symbol, activePeriod, activeInterval])

  useEffect(() => {
    fetch(`/api/market/quote?symbols=${symbol}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setQuote(data) })
      .catch(() => {})
  }, [symbol])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/market/chart?symbol=${symbol}&period=${activePeriod}&interval=${activeInterval}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setChartData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol, activePeriod, activeInterval])

  useEffect(() => {
    const supabase = createClient()
    supabase.from("watchlists").select("symbols").limit(1).single()
      .then(({ data }) => { if (data?.symbols?.includes(symbol)) setInWatchlist(true) })
  }, [symbol])

  async function toggleWatchlist() {
    setWatchlistLoading(true)
    const supabase = createClient()
    const userId = await getCurrentUserId()
    const { data: existing } = await supabase.from("watchlists").select("id, symbols").limit(1).single()

    if (existing) {
      const syms: string[] = existing.symbols ?? []
      const next = inWatchlist ? syms.filter((s: string) => s !== symbol) : [...syms, symbol]
      await supabase.from("watchlists").update({ symbols: next }).eq("id", existing.id)
      setInWatchlist(!inWatchlist)
    } else {
      await supabase.from("watchlists").insert({ user_id: userId, name: "My Watchlist", symbols: [symbol] })
      setInWatchlist(true)
    }
    setWatchlistLoading(false)
  }

  async function handleCreateAlert(sym: string, price: number, condition: "above" | "below") {
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
          condition_type: condition,
          condition_value: price,
        }),
      })
      if (res.ok) {
        // Brief visual confirmation — could be a toast in the future
        alert(`Alert created: ${sym} ${condition} $${price.toFixed(2)}`)
      }
    } catch {
      // ignore
    }
  }

  const isPositive = (quote?.regularMarketChange ?? 0) >= 0

  return (
    <div className="space-y-4">
      {/* ── Compact ticker bar ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {quote ? (
          <>
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-bold">{quote.symbol}</h1>
              <span className="text-sm text-muted-foreground">{quote.shortName}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">${quote.regularMarketPrice.toFixed(2)}</span>
              <span className={cn("text-sm font-medium", isPositive ? "text-[#26a69a]" : "text-[#ef5350]")}>
                {isPositive ? "+" : ""}{quote.regularMarketChange.toFixed(2)} ({isPositive ? "+" : ""}{quote.regularMarketChangePercent.toFixed(2)}%)
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Vol <strong className="text-foreground">{formatVol(quote.regularMarketVolume)}</strong></span>
              <span>Mkt Cap <strong className="text-foreground">{formatNum(quote.marketCap)}</strong></span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-6 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          </div>
        )}

        <div className="ml-auto">
          <Button
            variant={inWatchlist ? "secondary" : "outline"}
            size="sm"
            onClick={toggleWatchlist}
            disabled={watchlistLoading}
          >
            {watchlistLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : inWatchlist ? (
              <Star className="mr-1 h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            {inWatchlist ? "Watching" : "Watch"}
          </Button>
        </div>
      </div>

      {/* ── Chart (hero) ────────────────────────────────────── */}
      {loading && chartData.length === 0 ? (
        <div className="rounded-md flex items-center justify-center" style={{ background: "#131722", height: "calc(100vh - 300px)", minHeight: 300 }}>
          <Loader2 className="h-6 w-6 animate-spin text-[#787b86]" />
        </div>
      ) : (
        <StockChart
          symbol={symbol}
          data={chartData}
          onPeriodChange={(period, interval) => {
            setActivePeriod(period)
            setActiveInterval(interval)
          }}
          activeInterval={activeInterval}
          onLoadMore={handleLoadMore}
          onCreateAlert={handleCreateAlert}
        />
      )}

      {/* ── Key stats strip ──────────────────────────────── */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px rounded-md overflow-hidden" style={{ background: "#2a2e39" }}>
          {[
            { label: "Prev Close", value: `$${quote.regularMarketPreviousClose.toFixed(2)}` },
            { label: "Open", value: `$${quote.regularMarketOpen.toFixed(2)}` },
            { label: "Day Low", value: `$${quote.regularMarketDayLow.toFixed(2)}` },
            { label: "Day High", value: `$${quote.regularMarketDayHigh.toFixed(2)}` },
            { label: "52W Low", value: `$${quote.fiftyTwoWeekLow.toFixed(2)}` },
            { label: "52W High", value: `$${quote.fiftyTwoWeekHigh.toFixed(2)}` },
            { label: "Volume", value: formatVol(quote.regularMarketVolume) },
            { label: "Mkt Cap", value: formatNum(quote.marketCap) },
          ].map((stat) => (
            <div key={stat.label} className="px-3 py-2.5" style={{ background: "#131722" }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "#787b86" }}>{stat.label}</div>
              <div className="text-xs font-medium" style={{ color: "#d1d4dc" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

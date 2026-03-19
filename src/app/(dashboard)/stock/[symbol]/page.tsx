"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"

const StockChart = dynamic(
  () => import("@/components/charts/stock-chart").then((m) => ({ default: m.StockChart })),
  { ssr: false, loading: () => <div className="h-[400px] bg-muted rounded-lg animate-pulse" /> }
)
import { FundamentalsGrid } from "@/components/market/fundamentals-grid"
import { SecFilings } from "@/components/market/sec-filings"
import { RedditSentiment } from "@/components/market/reddit-sentiment"
import { StockScore } from "@/components/market/stock-score"
import { StockNews } from "@/components/market/stock-news"
import { OptionsChain } from "@/components/market/options-chain"
import { Button } from "@/components/ui/button"
import { Star, Plus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { cn } from "@/lib/utils"
import type { Quote, OHLC } from "@/types/market"
import type { ChartEvent } from "@/components/charts/stock-chart"
import { useCurrency } from "@/hooks/useCurrency"

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
  const [alerts, setAlerts] = useState<Array<{ id: string; price: number; condition: string }>>([])
  const [chartEvents, setChartEvents] = useState<ChartEvent[]>([])
  const [activeTab, setActiveTab] = useState<"overview" | "options" | "news" | "filings">("overview")
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

  // Check alerts client-side when quote updates
  const checkAlerts = useCallback((currentPrice: number) => {
    if (!currentPrice || alerts.length === 0) return
    const triggered: string[] = []
    for (const a of alerts) {
      const isTriggered =
        (a.condition === "above" && currentPrice >= a.price) ||
        (a.condition === "below" && currentPrice <= a.price)
      if (isTriggered) triggered.push(a.id)
    }
    if (triggered.length > 0) {
      // Call server to officially trigger and send email
      fetch("/api/alerts/check").catch(() => {})
      // Remove triggered alerts from local state
      setAlerts((prev) => prev.filter((a) => !triggered.includes(a.id)))
    }
  }, [alerts])

  useEffect(() => {
    fetch(`/api/market/quote?symbols=${symbol}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setQuote(data)
          checkAlerts(data.regularMarketPrice)
        }
      })
      .catch(() => {})

    // Poll quote every 15s for intraday
    const quoteInterval = setInterval(() => {
      fetch(`/api/market/quote?symbols=${symbol}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setQuote(data)
            checkAlerts(data.regularMarketPrice)
          }
        })
        .catch(() => {})
    }, 15000)
    return () => clearInterval(quoteInterval)
  }, [symbol, checkAlerts])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/market/chart?symbol=${symbol}&period=${activePeriod}&interval=${activeInterval}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setChartData(data))
      .catch(() => {})
      .finally(() => setLoading(false))

    // Poll chart data for intraday intervals
    const isIntraday = ["1m", "5m", "15m", "1h"].includes(activeInterval)
    if (!isIntraday) return

    const pollMs = activeInterval === "1m" ? 10000 : activeInterval === "5m" ? 30000 : 60000
    const chartInterval = setInterval(() => {
      fetch(`/api/market/chart?symbol=${symbol}&period=${activePeriod}&interval=${activeInterval}`)
        .then((r) => r.ok ? r.json() : null)
        .then((newData: OHLC[] | null) => {
          if (!newData || newData.length === 0) return
          setChartData((prev) => {
            // Merge: update last candle if same timestamp, append if new
            const merged = [...prev]
            for (const candle of newData) {
              const idx = merged.findIndex((d) => d.time === candle.time)
              if (idx >= 0) {
                merged[idx] = candle // update existing candle
              } else {
                merged.push(candle)
              }
            }
            return merged.sort((a, b) => a.time - b.time)
          })
        })
        .catch(() => {})
    }, pollMs)
    return () => clearInterval(chartInterval)
  }, [symbol, activePeriod, activeInterval])

  useEffect(() => {
    const supabase = createClient()
    supabase.from("watchlists").select("symbols").limit(1).single()
      .then(({ data }) => { if (data?.symbols?.includes(symbol)) setInWatchlist(true) })
  }, [symbol])

  // Fetch chart events (earnings, dividends, splits)
  useEffect(() => {
    fetch(`/api/market/chart-events?symbol=${symbol}`)
      .then((r) => r.ok ? r.json() : [])
      .then((events: ChartEvent[]) => setChartEvents(events))
      .catch(() => {})
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

  // Fetch existing alerts for this symbol
  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ id: string; symbol: string; condition_type: string; condition_value: string; is_active: boolean }>) => {
        setAlerts(
          data
            .filter((a) => a.symbol === symbol && a.is_active)
            .map((a) => ({ id: a.id, price: parseFloat(a.condition_value), condition: a.condition_type }))
        )
      })
      .catch(() => {})
  }, [symbol])

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
        const newAlert = await res.json()
        setAlerts((prev) => [...prev, { id: newAlert.id, price, condition }])
      }
    } catch {
      // ignore
    }
  }

  async function handleRemoveAlert(alertId: string) {
    try {
      const res = await fetch(`/api/alerts?id=${alertId}`, { method: "DELETE" })
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId))
      }
    } catch {
      // ignore
    }
  }

  async function handleMoveAlert(alertId: string, newPrice: number) {
    // Optimistically update local state
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, price: newPrice } : a))
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alertId, condition_value: newPrice }),
      })
    } catch {
      // ignore
    }
  }

  const { fmtNative } = useCurrency()
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
              <span className="text-2xl font-bold">{fmtNative(quote.regularMarketPrice)}</span>
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
          onRemoveAlert={handleRemoveAlert}
          onMoveAlert={handleMoveAlert}
          alerts={alerts}
          events={chartEvents}
        />
      )}

      {/* ── Key stats strip ──────────────────────────────── */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px rounded-md overflow-hidden" style={{ background: "#2a2e39" }}>
          {[
            { label: "Prev Close", value: fmtNative(quote.regularMarketPreviousClose) },
            { label: "Open", value: fmtNative(quote.regularMarketOpen) },
            { label: "Day Low", value: fmtNative(quote.regularMarketDayLow) },
            { label: "Day High", value: fmtNative(quote.regularMarketDayHigh) },
            { label: "52W Low", value: fmtNative(quote.fiftyTwoWeekLow) },
            { label: "52W High", value: fmtNative(quote.fiftyTwoWeekHigh) },
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

      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="flex gap-0.5 rounded-md p-1" style={{ background: "#131722" }}>
        {([
          { key: "overview" as const, label: "Overview" },
          { key: "options" as const, label: "Options" },
          { key: "news" as const, label: "News" },
          { key: "filings" as const, label: "Filings" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded transition-colors",
              activeTab === key
                ? "bg-[#2a2e39] text-[#d1d4dc]"
                : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <StockScore symbol={symbol} />
          <FundamentalsGrid symbol={symbol} />
          <RedditSentiment symbol={symbol} />
        </div>
      )}

      {activeTab === "options" && (
        <OptionsChain symbol={symbol} underlyingPrice={quote?.regularMarketPrice} />
      )}

      {activeTab === "news" && (
        <StockNews symbol={symbol} />
      )}

      {activeTab === "filings" && (
        <SecFilings symbol={symbol} />
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { StockChart } from "@/components/charts/stock-chart"
import { QuoteHeader } from "@/components/market/quote-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Star, Plus, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import type { Quote, OHLC } from "@/types/market"

function formatVolume(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toString()
}

export default function StockDetailPage() {
  const params = useParams()
  const symbol = (params.symbol as string).toUpperCase()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [chartData, setChartData] = useState<OHLC[]>([])
  const [activePeriod, setActivePeriod] = useState("6mo")
  const [loading, setLoading] = useState(true)
  const [inWatchlist, setInWatchlist] = useState(false)
  const [watchlistLoading, setWatchlistLoading] = useState(false)

  useEffect(() => {
    async function fetchQuote() {
      try {
        const res = await fetch(`/api/market/quote?symbols=${symbol}`)
        if (res.ok) {
          const data = await res.json()
          setQuote(data)
        }
      } catch (error) {
        console.error("Failed to fetch quote:", error)
      }
    }
    fetchQuote()
  }, [symbol])

  useEffect(() => {
    async function fetchChart() {
      setLoading(true)
      try {
        const intervalMap: Record<string, string> = {
          "1d": "5m",
          "5d": "15m",
          "1mo": "1h",
          "3mo": "1d",
          "6mo": "1d",
          "1y": "1d",
          "2y": "1wk",
        }
        const interval = intervalMap[activePeriod] ?? "1d"
        const res = await fetch(
          `/api/market/chart?symbol=${symbol}&period=${activePeriod}&interval=${interval}`
        )
        if (res.ok) {
          const data = await res.json()
          setChartData(data)
        }
      } catch (error) {
        console.error("Failed to fetch chart:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchChart()
  }, [symbol, activePeriod])

  // Check if symbol is in watchlist
  useEffect(() => {
    async function checkWatchlist() {
      const supabase = createClient()
      const { data } = await supabase.from("watchlists").select("symbols").limit(1).single()
      if (data?.symbols?.includes(symbol)) {
        setInWatchlist(true)
      }
    }
    checkWatchlist()
  }, [symbol])

  async function toggleWatchlist() {
    setWatchlistLoading(true)
    const supabase = createClient()
    const userId = await getCurrentUserId()

    const { data: existing } = await supabase.from("watchlists").select("id, symbols").limit(1).single()

    if (existing) {
      const currentSymbols: string[] = existing.symbols ?? []
      const newSymbols = inWatchlist
        ? currentSymbols.filter((s: string) => s !== symbol)
        : [...currentSymbols, symbol]

      await supabase.from("watchlists").update({ symbols: newSymbols }).eq("id", existing.id)
      setInWatchlist(!inWatchlist)
    } else {
      await supabase.from("watchlists").insert({
        user_id: userId,
        name: "My Watchlist",
        symbols: [symbol],
      })
      setInWatchlist(true)
    }
    setWatchlistLoading(false)
  }

  function handlePeriodChange(period: string) {
    setActivePeriod(period)
  }

  return (
    <div className="space-y-6">
      {/* Quote header + watchlist button */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          {quote ? (
            <QuoteHeader quote={quote} />
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-8 w-32 bg-muted rounded" />
              <div className="h-12 w-48 bg-muted rounded" />
            </div>
          )}
        </div>
        <Button
          variant={inWatchlist ? "secondary" : "outline"}
          size="sm"
          onClick={toggleWatchlist}
          disabled={watchlistLoading}
          className="w-fit"
        >
          {watchlistLoading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : inWatchlist ? (
            <Star className="mr-1 h-4 w-4 fill-yellow-500 text-yellow-500" />
          ) : (
            <Plus className="mr-1 h-4 w-4" />
          )}
          {inWatchlist ? "In Watchlist" : "Add to Watchlist"}
        </Button>
      </div>

      {/* Chart */}
      {loading && chartData.length === 0 ? (
        <Card>
          <CardContent className="h-[400px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <StockChart
          symbol={symbol}
          data={chartData}
          onPeriodChange={handlePeriodChange}
          activePeriod={activePeriod}
        />
      )}

      {/* Key stats grid */}
      {quote && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Previous Close</span>
                <p className="font-medium">${quote.regularMarketPreviousClose.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Open</span>
                <p className="font-medium">${quote.regularMarketOpen.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Day Low</span>
                <p className="font-medium">${quote.regularMarketDayLow.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Day High</span>
                <p className="font-medium">${quote.regularMarketDayHigh.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">52 Week Low</span>
                <p className="font-medium">${quote.fiftyTwoWeekLow.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">52 Week High</span>
                <p className="font-medium">${quote.fiftyTwoWeekHigh.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Volume</span>
                <p className="font-medium">{formatVolume(quote.regularMarketVolume)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Market Cap</span>
                <p className="font-medium">
                  {quote.marketCap >= 1e12 ? `$${(quote.marketCap / 1e12).toFixed(2)}T` :
                   quote.marketCap >= 1e9 ? `$${(quote.marketCap / 1e9).toFixed(2)}B` :
                   `$${(quote.marketCap / 1e6).toFixed(2)}M`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

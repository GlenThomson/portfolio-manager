"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MiniSparkline } from "@/components/charts/mini-sparkline"
import { Plus, Star, TrendingUp, TrendingDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/hooks/useCurrency"

interface WatchlistItem {
  symbol: string
  shortName: string
  price: number
  change: number
  changePct: number
  sparklineData: { time: number; value: number }[]
}

export default function WatchlistPage() {
  const [watchlistId, setWatchlistId] = useState<string | null>(null)
  const [symbols, setSymbols] = useState<string[]>([])
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [newSymbol, setNewSymbol] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const { fmtNative } = useCurrency()

  useEffect(() => {
    fetchWatchlist()
  }, [])

  useEffect(() => {
    if (symbols.length > 0) {
      fetchQuotesAndSparklines()
    }
  }, [symbols])

  async function fetchWatchlist() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("watchlists")
      .select("*")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (data) {
      setWatchlistId(data.id)
      setSymbols(data.symbols ?? [])
    }
    setLoading(false)
  }

  async function fetchQuotesAndSparklines() {
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

      const newItems: WatchlistItem[] = quotes.map((q: Record<string, unknown>) => ({
        symbol: q.symbol as string,
        shortName: q.shortName as string,
        price: q.regularMarketPrice as number,
        change: q.regularMarketChange as number,
        changePct: q.regularMarketChangePercent as number,
        sparklineData: chartDataMap[q.symbol as string] ?? [],
      }))

      setItems(newItems)
    } catch (error) {
      console.error("Failed to fetch watchlist data:", error)
    }
  }

  async function addSymbol(e: React.FormEvent) {
    e.preventDefault()
    const symbol = newSymbol.toUpperCase().trim()
    if (!symbol || symbols.includes(symbol)) return

    const supabase = createClient()
    const userId = await getCurrentUserId()

    const newSymbols = [...symbols, symbol]

    if (watchlistId) {
      await supabase
        .from("watchlists")
        .update({ symbols: newSymbols })
        .eq("id", watchlistId)
    } else {
      const { data } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, name: "My Watchlist", symbols: newSymbols })
        .select("id")
        .single()
      if (data) setWatchlistId(data.id)
    }

    setSymbols(newSymbols)
    setNewSymbol("")
    setDialogOpen(false)
  }

  async function removeSymbol(symbol: string) {
    if (!watchlistId) return
    const newSymbols = symbols.filter((s) => s !== symbol)
    const supabase = createClient()
    await supabase
      .from("watchlists")
      .update({ symbols: newSymbols })
      .eq("id", watchlistId)

    setSymbols(newSymbols)
    setItems(items.filter((i) => i.symbol !== symbol))
  }

  if (loading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground">Track stocks you&apos;re interested in</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Symbol
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Watchlist</DialogTitle>
            </DialogHeader>
            <form onSubmit={addSymbol} className="space-y-4">
              <Input
                placeholder="e.g. AAPL, MSFT, GOOGL"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                required
              />
              <Button type="submit" className="w-full">Add</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {symbols.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Star className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Your watchlist is empty</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Add stocks to keep an eye on their performance.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Use the search bar above to find stocks, or add a symbol directly.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Symbol
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <Card key={item.symbol} className="hover:bg-accent/30 transition-colors">
              <CardContent className="flex items-center gap-4 py-3 px-4">
                <Link href={`/stock/${item.symbol}`} className="flex-1 flex items-center gap-4">
                  <div className="min-w-[100px]">
                    <p className="font-bold text-primary">{item.symbol}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {item.shortName}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <MiniSparkline data={item.sparklineData} />
                  </div>
                  <div className="ml-auto text-right">
                    <p className="font-bold">{item.price != null ? fmtNative(item.price) : "—"}</p>
                    <p
                      className={cn(
                        "text-sm flex items-center justify-end gap-1",
                        (item.change ?? 0) >= 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {(item.change ?? 0) >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {(item.change ?? 0) >= 0 ? "+" : ""}
                      {item.changePct != null ? `${item.changePct.toFixed(2)}%` : "—"}
                    </p>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeSymbol(item.symbol)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TickerSearch } from "@/components/ui/ticker-search"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import dynamic from "next/dynamic"

const MiniSparkline = dynamic(
  () => import("@/components/charts/mini-sparkline").then((m) => ({ default: m.MiniSparkline })),
  { ssr: false }
)
import { Plus, Star, TrendingUp, TrendingDown, X, Loader2, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/hooks/useCurrency"
import { useWatchlistMeta, useWatchlistQuotes, fetchSingleQuote } from "@/hooks/use-watchlist-data"
import type { WatchlistItem } from "@/hooks/use-watchlist-data"

export default function WatchlistPage() {
  const [newSymbol, setNewSymbol] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { fmtNative } = useCurrency()
  const queryClient = useQueryClient()
  const router = useRouter()

  const { data: meta, isLoading } = useWatchlistMeta()
  const watchlistId = meta?.id ?? null
  const symbols = meta?.symbols ?? []

  const { data: quotesMap = {} } = useWatchlistQuotes(symbols)

  async function addSymbol(e?: React.FormEvent, overrideSymbol?: string) {
    e?.preventDefault()
    const symbol = (overrideSymbol ?? newSymbol).toUpperCase().trim()
    if (!symbol || symbols.includes(symbol)) return

    const supabase = createClient()
    const userId = await getCurrentUserId()

    const newSymbols = [...symbols, symbol]

    // Optimistically update meta so the card appears instantly (with spinner)
    queryClient.setQueryData(["watchlist-meta"], (old: { id: string | null; symbols: string[] } | undefined) => ({
      id: old?.id ?? null,
      symbols: newSymbols,
    }))

    setNewSymbol("")
    setDialogOpen(false)

    // Save to DB
    if (watchlistId) {
      await supabase
        .from("watchlists")
        .update({ symbols: newSymbols })
        .eq("id", watchlistId)
    } else {
      const { data: inserted } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, name: "My Watchlist", symbols: newSymbols })
        .select("id")
        .single()
      if (inserted) {
        queryClient.setQueryData(["watchlist-meta"], { id: inserted.id, symbols: newSymbols })
      }
    }

    // Fetch ONLY the new symbol's data, then merge into existing cache
    const newItem = await fetchSingleQuote(symbol)
    if (newItem) {
      queryClient.setQueryData<Record<string, WatchlistItem>>(["watchlist-quotes"], (old) => ({
        ...old,
        [symbol]: newItem,
      }))
    }
  }

  async function removeSymbol(symbol: string) {
    if (!watchlistId) return
    const newSymbols = symbols.filter((s) => s !== symbol)

    // Optimistically remove card and its data — no refetch needed
    queryClient.setQueryData(["watchlist-meta"], (old: { id: string | null; symbols: string[] } | undefined) => ({
      id: old?.id ?? null,
      symbols: newSymbols,
    }))
    queryClient.setQueryData<Record<string, WatchlistItem>>(["watchlist-quotes"], (old) => {
      if (!old) return old
      const updated = { ...old }
      delete updated[symbol]
      return updated
    })

    // Save to DB — no invalidation, cache is already correct
    const supabase = createClient()
    await supabase
      .from("watchlists")
      .update({ symbols: newSymbols })
      .eq("id", watchlistId)
  }

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-muted-foreground">Track stocks you&apos;re interested in</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size >= 2 && (
            <Button
              variant="outline"
              onClick={() => router.push(`/compare?symbols=${Array.from(selected).join(",")}`)}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Compare ({selected.size})
            </Button>
          )}
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
            <form onSubmit={(e) => addSymbol(e)} className="flex items-center gap-2">
              <TickerSearch
                value={newSymbol}
                onChange={setNewSymbol}
                onSelect={(sym) => addSymbol(undefined, sym)}
                placeholder="e.g. AAPL"
                className="flex-1"
                autoFocus
              />
              <Button type="submit" className="shrink-0">Add</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
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
          {symbols.map((symbol) => {
            const item: WatchlistItem | undefined = quotesMap[symbol]
            return (
              <Card key={symbol} className="hover:bg-accent/30 transition-colors">
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  <button
                    onClick={() => setSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(symbol)) next.delete(symbol)
                      else next.add(symbol)
                      return next
                    })}
                    className={cn(
                      "h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors",
                      selected.has(symbol)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30 hover:border-muted-foreground"
                    )}
                  >
                    {selected.has(symbol) && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <Link href={`/stock/${symbol}`} className="flex-1 flex items-center gap-4">
                    <div className="min-w-[100px]">
                      <p className="font-bold text-primary">{symbol}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {item?.shortName ?? ""}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      {item ? (
                        <MiniSparkline data={item.sparklineData} />
                      ) : (
                        <div className="w-[100px] h-[32px]" />
                      )}
                    </div>
                    <div className="ml-auto text-right">
                      {item ? (
                        <>
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
                        </>
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
                      )}
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSymbol(symbol)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Briefcase, TrendingUp, TrendingDown, DollarSign, Plus, ArrowRight, Star } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

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
}

interface WatchlistQuote {
  symbol: string
  shortName: string
  price: number
  change: number
  changePct: number
}

export default function DashboardPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePct: number }>>({})
  const [watchlistQuotes, setWatchlistQuotes] = useState<WatchlistQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    const supabase = createClient()

    const [portfolioRes, positionsRes, watchlistRes] = await Promise.all([
      supabase.from("portfolios").select("id, name, is_paper").order("created_at", { ascending: false }),
      supabase.from("portfolio_positions").select("symbol, quantity, average_cost, portfolio_id").is("closed_at", null),
      supabase.from("watchlists").select("symbols").limit(1).single(),
    ])

    const portfolioData = portfolioRes.data ?? []
    const positionData = positionsRes.data ?? []
    setPortfolios(portfolioData)
    setPositions(positionData)

    // Fetch live quotes for all position symbols
    const posSymbols = Array.from(new Set(positionData.map((p) => p.symbol)))
    if (posSymbols.length > 0) {
      try {
        const res = await fetch(`/api/market/quote?symbols=${posSymbols.join(",")}`)
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : [data]
          const quoteMap: Record<string, { price: number; change: number; changePct: number }> = {}
          list.forEach((q: { symbol: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number }) => {
            quoteMap[q.symbol] = {
              price: q.regularMarketPrice,
              change: q.regularMarketChange,
              changePct: q.regularMarketChangePercent,
            }
          })
          setQuotes(quoteMap)
        }
      } catch {}
    }

    // Fetch watchlist quotes
    const watchSymbols: string[] = watchlistRes.data?.symbols ?? []
    if (watchSymbols.length > 0) {
      try {
        const res = await fetch(`/api/market/quote?symbols=${watchSymbols.slice(0, 5).join(",")}`)
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : [data]
          setWatchlistQuotes(
            list.map((q: { symbol: string; shortName: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number }) => ({
              symbol: q.symbol,
              shortName: q.shortName,
              price: q.regularMarketPrice,
              change: q.regularMarketChange,
              changePct: q.regularMarketChangePercent,
            }))
          )
        }
      } catch {}
    }

    setLoading(false)
  }

  // Calculate totals
  const totalValue = positions.reduce((sum, p) => {
    const q = quotes[p.symbol]
    return sum + (q ? q.price * parseFloat(p.quantity) : 0)
  }, 0)

  const totalCost = positions.reduce(
    (sum, p) => sum + parseFloat(p.average_cost) * parseFloat(p.quantity),
    0
  )

  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const dayChange = positions.reduce((sum, p) => {
    const q = quotes[p.symbol]
    return sum + (q ? q.change * parseFloat(p.quantity) : 0)
  }, 0)

  const dayChangePct = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your portfolio overview at a glance.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {positions.length > 0 ? `Across ${portfolios.length} portfolio${portfolios.length !== 1 ? "s" : ""}` : "Add positions to get started"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day Change</CardTitle>
            {dayChange >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", dayChange >= 0 ? "text-green-500" : "text-red-500")}>
              {dayChange >= 0 ? "+" : ""}${Math.abs(dayChange).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className={cn("text-xs", dayChange >= 0 ? "text-green-500" : "text-red-500")}>
              {dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            {totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
              {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className={cn("text-xs", totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
            <p className="text-xs text-muted-foreground">
              Across {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bottom section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Portfolios */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Portfolios</CardTitle>
            <Link href="/portfolio">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {portfolios.length === 0 ? (
              <div className="flex flex-col items-center py-6">
                <Briefcase className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No portfolios yet</p>
                <Link href="/portfolio">
                  <Button size="sm">
                    <Plus className="mr-1 h-3 w-3" />
                    Create Portfolio
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {portfolios.slice(0, 4).map((p) => {
                  const portfolioPositions = positions.filter((pos) => pos.portfolio_id === p.id)
                  const value = portfolioPositions.reduce((sum, pos) => {
                    const q = quotes[pos.symbol]
                    return sum + (q ? q.price * parseFloat(pos.quantity) : 0)
                  }, 0)

                  return (
                    <Link key={p.id} href={`/portfolio/${p.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{p.name}</span>
                        {p.is_paper && (
                          <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded">Paper</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">
                          ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {portfolioPositions.length} pos
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Watchlist */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Watchlist</CardTitle>
            <Link href="/watchlist">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {watchlistQuotes.length === 0 ? (
              <div className="flex flex-col items-center py-6">
                <Star className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No watchlist items yet</p>
                <Link href="/watchlist">
                  <Button size="sm">
                    <Plus className="mr-1 h-3 w-3" />
                    Add Stocks
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {watchlistQuotes.map((item) => (
                  <Link
                    key={item.symbol}
                    href={`/stock/${item.symbol}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors"
                  >
                    <div>
                      <span className="font-medium text-sm">{item.symbol}</span>
                      <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{item.shortName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
                      <span className={cn("text-xs ml-2", item.change >= 0 ? "text-green-500" : "text-red-500")}>
                        {item.change >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

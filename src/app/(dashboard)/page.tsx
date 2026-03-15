"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Briefcase, TrendingUp, TrendingDown, DollarSign, Plus, ArrowRight, Star, Activity, ArrowUpDown, Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AllocationChart } from "@/components/dashboard/allocation-chart"
import { useCurrency } from "@/hooks/useCurrency"

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

interface TopMover {
  symbol: string
  price: number
  change: number
  changePct: number
  source: "portfolio" | "watchlist"
}

export default function DashboardPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePct: number }>>({})
  const [watchlistQuotes, setWatchlistQuotes] = useState<WatchlistQuote[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const { currencySymbol, fxRate, fmt } = useCurrency()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [portfolioRes, positionsRes, watchlistRes, transactionsRes] = await Promise.all([
      supabase.from("portfolios").select("id, name, is_paper").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("portfolio_positions").select("symbol, quantity, average_cost, portfolio_id, asset_type").eq("user_id", user.id).is("closed_at", null),
      supabase.from("watchlists").select("symbols").eq("user_id", user.id).limit(1).single(),
      supabase.from("transactions").select("id, symbol, action, quantity, price, executed_at, portfolio_id").eq("user_id", user.id).order("executed_at", { ascending: false }).limit(5),
    ])

    const portfolioData = portfolioRes.data ?? []
    const positionData = positionsRes.data ?? []
    setPortfolios(portfolioData)
    setPositions(positionData)
    setTransactions(transactionsRes.data ?? [])

    // Fetch live quotes for all position symbols (exclude cash)
    const stockPositions = positionData.filter((p: { asset_type?: string }) => p.asset_type !== "cash")
    const posSymbols = Array.from(new Set(stockPositions.map((p) => p.symbol)))

    // Watchlist symbols
    const watchSymbols: string[] = watchlistRes.data?.symbols ?? []

    // Combine all unique symbols for a single quote fetch
    const allSymbols = Array.from(new Set([...posSymbols, ...watchSymbols.slice(0, 10)]))

    if (allSymbols.length > 0) {
      try {
        const res = await fetch(`/api/market/quote?symbols=${allSymbols.join(",")}`)
        if (res.ok) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : [data]
          const quoteMap: Record<string, { price: number; change: number; changePct: number }> = {}
          list.forEach((q: { symbol: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; shortName?: string }) => {
            quoteMap[q.symbol] = {
              price: q.regularMarketPrice,
              change: q.regularMarketChange,
              changePct: q.regularMarketChangePercent,
            }
          })
          setQuotes(quoteMap)

          // Build watchlist quotes from the same data
          const wlQuotes: WatchlistQuote[] = []
          list.forEach((q: { symbol: string; regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number; shortName?: string }) => {
            if (watchSymbols.includes(q.symbol)) {
              wlQuotes.push({
                symbol: q.symbol,
                shortName: q.shortName ?? q.symbol,
                price: q.regularMarketPrice,
                change: q.regularMarketChange,
                changePct: q.regularMarketChangePercent,
              })
            }
          })
          setWatchlistQuotes(wlQuotes.slice(0, 5))
        }
      } catch {}
    }

    setLoading(false)
  }

  // Separate stock and cash positions
  const stockPositions = positions.filter((p) => p.asset_type !== "cash")
  const cashPositions = positions.filter((p) => p.asset_type === "cash")

  // Calculate totals
  const totalValue = stockPositions.reduce((sum, p) => {
    const q = quotes[p.symbol]
    return sum + (q ? q.price * parseFloat(p.quantity) : 0)
  }, 0)

  const totalCost = stockPositions.reduce(
    (sum, p) => sum + parseFloat(p.average_cost) * parseFloat(p.quantity),
    0
  )

  const totalCash = cashPositions.reduce(
    (sum, p) => sum + parseFloat(p.average_cost),
    0
  )

  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const dayChange = stockPositions.reduce((sum, p) => {
    const q = quotes[p.symbol]
    return sum + (q ? q.change * parseFloat(p.quantity) : 0)
  }, 0)

  const dayChangePct = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0

  // Build allocation data (stock positions only)
  const allocationHoldings = stockPositions
    .filter((p) => quotes[p.symbol])
    .map((p) => ({
      symbol: p.symbol,
      value: quotes[p.symbol].price * parseFloat(p.quantity),
    }))

  // Build top movers: combine portfolio + watchlist quotes, sort by abs changePct
  const topMovers: TopMover[] = (() => {
    const seen = new Set<string>()
    const movers: TopMover[] = []

    // Portfolio positions
    for (const p of stockPositions) {
      const q = quotes[p.symbol]
      if (q && !seen.has(p.symbol)) {
        seen.add(p.symbol)
        movers.push({
          symbol: p.symbol,
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          source: "portfolio",
        })
      }
    }

    // Watchlist
    for (const wq of watchlistQuotes) {
      if (!seen.has(wq.symbol)) {
        seen.add(wq.symbol)
        movers.push({
          symbol: wq.symbol,
          price: wq.price,
          change: wq.change,
          changePct: wq.changePct,
          source: "watchlist",
        })
      }
    }

    return movers
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5)
  })()

  // Portfolio name lookup for transactions
  const portfolioMap = new Map(portfolios.map((p) => [p.id, p.name]))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // Empty state: no portfolios at all
  if (portfolios.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your portfolio overview at a glance.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-primary/10 p-4 mb-4">
              <Briefcase className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Welcome to PortfolioAI</h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Get started by creating your first portfolio. Track your investments,
              monitor performance, and get AI-powered insights.
            </p>
            <Link href="/portfolio">
              <Button size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Portfolio
              </Button>
            </Link>
          </CardContent>
        </Card>

        {watchlistQuotes.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Star className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                Add stocks to your watchlist to track market movements
              </p>
              <Link href="/watchlist">
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-3 w-3" />
                  Set Up Watchlist
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmt(totalValue)}
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
              {dayChange >= 0 ? "+" : "-"}{currencySymbol}{(Math.abs(dayChange) * fxRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              {totalPnl >= 0 ? "+" : "-"}{currencySymbol}{(Math.abs(totalPnl) * fxRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <div className="text-2xl font-bold">{stockPositions.length}</div>
            <p className="text-xs text-muted-foreground">
              Across {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Middle section: Allocation chart + Top movers */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Allocation Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Portfolio Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allocationHoldings.length === 0 && totalCash <= 0 ? (
              <div className="flex flex-col items-center py-8">
                <Activity className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Add positions to see your allocation breakdown
                </p>
              </div>
            ) : (
              <AllocationChart holdings={allocationHoldings} cashTotal={totalCash} currencySymbol={currencySymbol} fxRate={fxRate} />
            )}
          </CardContent>
        </Card>

        {/* Top Movers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4" />
              Top Movers Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topMovers.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <ArrowUpDown className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No market data available yet
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {topMovers.map((mover) => (
                  <Link
                    key={mover.symbol}
                    href={`/stock/${mover.symbol}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{mover.symbol}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          mover.source === "portfolio"
                            ? "border-blue-500/30 text-blue-400"
                            : "border-yellow-500/30 text-yellow-400"
                        )}
                      >
                        {mover.source === "portfolio" ? "Held" : "Watch"}
                      </Badge>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {fmt(mover.price)}
                      </span>
                      <div className={cn(
                        "flex items-center gap-1 min-w-[80px] justify-end",
                        mover.change >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {mover.change >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span className="text-sm font-medium">
                          {mover.changePct >= 0 ? "+" : ""}{mover.changePct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <Receipt className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No transactions yet. Add your first trade to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Portfolio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const qty = parseFloat(tx.quantity)
                    const price = parseFloat(tx.price)
                    const total = qty * price
                    const isBuy = tx.action === "buy"

                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(tx.executed_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/stock/${tx.symbol}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {tx.symbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              isBuy
                                ? "bg-green-500/20 text-green-500 hover:bg-green-500/30 border-transparent"
                                : "bg-red-500/20 text-red-500 hover:bg-red-500/30 border-transparent"
                            )}
                          >
                            {tx.action.charAt(0).toUpperCase() + tx.action.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{qty.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {price > 0 ? fmt(price) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {total > 0 ? fmt(total) : "—"}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/portfolio/${tx.portfolio_id}`}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {portfolioMap.get(tx.portfolio_id) ?? "Portfolio"}
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom section: Portfolios + Watchlist */}
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
                  const portfolioPositions = stockPositions.filter((pos) => pos.portfolio_id === p.id)
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
                          {fmt(value)}
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
                <p className="text-sm text-muted-foreground mb-3">
                  Track your favorite stocks by adding them to your watchlist
                </p>
                <Link href="/watchlist">
                  <Button size="sm">
                    <Plus className="mr-1 h-3 w-3" />
                    Add Stocks to Watch
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
                      <span className="text-sm font-medium">{fmt(item.price)}</span>
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

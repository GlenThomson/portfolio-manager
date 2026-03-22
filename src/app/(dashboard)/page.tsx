"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
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
import { Briefcase, TrendingUp, TrendingDown, DollarSign, Plus, ArrowRight, Star, Activity, ArrowUpDown, Receipt, Newspaper, ExternalLink, Home, Car, Wallet, Bitcoin, PiggyBank, Package, Building2, Banknote, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"
import { AllocationChart } from "@/components/dashboard/allocation-chart"
import { useCurrency } from "@/hooks/useCurrency"
import { useDashboardData, useMarketNews } from "@/hooks/use-dashboard-data"
import { useQuery } from "@tanstack/react-query"

const NetWorthChart = dynamic(
  () => import("@/components/charts/net-worth-chart").then((m) => ({ default: m.NetWorthChart })),
  { ssr: false, loading: () => <div className="h-[200px] bg-muted/30 rounded animate-pulse" /> }
)

interface TopMover {
  symbol: string
  price: number
  change: number
  changePct: number
  source: "portfolio" | "watchlist"
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboardData()
  const { data: marketNews = [] } = useMarketNews()
  const { fmtNative, fmtHome } = useCurrency()
  const snapshotRecorded = useRef(false)

  // Fetch net worth history
  const { data: netWorthHistory = [] } = useQuery({
    queryKey: ["net-worth-history"],
    queryFn: async () => {
      const res = await fetch("/api/net-worth")
      if (!res.ok) return []
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const {
    portfolios = [],
    positions = [],
    quotes = {},
    watchlistQuotes = [],
    transactions = [],
    assets = [],
  } = data ?? {}

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

  // Net worth calculations
  const LIABILITY_TYPES = new Set(["mortgage", "loan", "credit-card", "other-liability"])
  const otherAssets = assets.filter((a) => !LIABILITY_TYPES.has(a.type))
  const liabilities = assets.filter((a) => LIABILITY_TYPES.has(a.type))
  const totalOtherAssets = otherAssets.reduce((sum, a) => sum + a.value, 0)
  const totalLiabilities = liabilities.reduce((sum, a) => sum + a.value, 0)
  const netWorth = totalValue + totalCash + totalOtherAssets - totalLiabilities

  // Record daily snapshot
  useEffect(() => {
    if (snapshotRecorded.current || isLoading || !data) return
    if (totalValue === 0 && totalCash === 0 && totalOtherAssets === 0) return
    snapshotRecorded.current = true
    fetch("/api/net-worth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total_investments: totalValue,
        total_cash: totalCash,
        total_other_assets: totalOtherAssets,
        total_liabilities: totalLiabilities,
        net_worth: netWorth,
      }),
    }).catch(() => {})
  }, [isLoading, data, totalValue, totalCash, totalOtherAssets, totalLiabilities, netWorth])

  // Net worth breakdown segments
  const ASSET_TYPE_ICONS: Record<string, typeof Home> = {
    property: Home, vehicle: Car, cash: Wallet, crypto: Bitcoin,
    kiwisaver: PiggyBank, "other-asset": Package,
    mortgage: Building2, loan: Banknote, "credit-card": CreditCard, "other-liability": Banknote,
  }
  const ASSET_TYPE_LABELS: Record<string, string> = {
    property: "Property", vehicle: "Vehicle", cash: "Savings", crypto: "Crypto",
    kiwisaver: "KiwiSaver", "other-asset": "Other",
    mortgage: "Mortgage", loan: "Loan", "credit-card": "Credit Card", "other-liability": "Other Debt",
  }

  // Group other assets by type for breakdown
  const assetsByType: { type: string; total: number; color: string }[] = []
  const typeColors: Record<string, string> = {
    property: "bg-blue-500", vehicle: "bg-cyan-500", cash: "bg-emerald-500",
    crypto: "bg-orange-500", kiwisaver: "bg-purple-500", "other-asset": "bg-gray-400",
  }
  const typeGroups: Record<string, number> = {}
  for (const a of otherAssets) {
    typeGroups[a.type] = (typeGroups[a.type] ?? 0) + a.value
  }
  for (const [type, total] of Object.entries(typeGroups)) {
    if (total > 0) assetsByType.push({ type, total, color: typeColors[type] ?? "bg-gray-400" })
  }
  // Add investments as a segment
  if (totalValue > 0) assetsByType.unshift({ type: "investments", total: totalValue, color: "bg-green-500" })
  if (totalCash > 0) assetsByType.push({ type: "investable-cash", total: totalCash, color: "bg-green-300" })

  const totalPositiveAssets = totalValue + totalCash + totalOtherAssets

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

  // Time ago helper for news
  function timeAgo(dateStr: string): string {
    if (!dateStr) return ""
    let then = new Date(dateStr).getTime()
    // If parsing as ISO failed or gave a very old date, try as unix timestamp (seconds)
    if (isNaN(then) || then < 0) {
      const asNum = Number(dateStr)
      if (!isNaN(asNum) && asNum > 1e9 && asNum < 1e11) {
        then = asNum * 1000
      } else {
        return ""
      }
    }
    const now = Date.now()
    const diff = now - then
    if (diff < 0) return "just now"
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Portfolio name lookup for transactions
  const portfolioMap = new Map(portfolios.map((p) => [p.id, p.name]))

  if (isLoading) {
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
          Your financial overview at a glance.
        </p>
      </div>

      {/* Net Worth Hero + Summary cards */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_1fr_1fr]">
        {/* Net Worth — big card */}
        <Card className="lg:row-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Worth</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={cn("text-3xl font-bold", netWorth >= 0 ? "text-green-500" : "text-red-500")}>
              {fmtHome(netWorth)}
            </div>

            {/* Breakdown bar */}
            {totalPositiveAssets > 0 && (
              <div className="space-y-3">
                <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                  {assetsByType.map((seg, i) => {
                    const pct = (seg.total / totalPositiveAssets) * 100
                    if (pct < 0.5) return null
                    return (
                      <div
                        key={i}
                        className={cn("h-full", seg.color)}
                        style={{ width: `${pct}%` }}
                      />
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="space-y-1.5">
                  {assetsByType.map((seg, i) => {
                    const label = seg.type === "investments" ? "Investments" : seg.type === "investable-cash" ? "Trading Cash" : (ASSET_TYPE_LABELS[seg.type] ?? seg.type)
                    const Icon = seg.type === "investments" ? Briefcase : seg.type === "investable-cash" ? Wallet : (ASSET_TYPE_ICONS[seg.type] ?? Package)
                    return (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", seg.color)} />
                          <Icon className="h-3 w-3 text-muted-foreground" />
                          <span>{label}</span>
                        </div>
                        <span className="font-medium">{fmtHome(seg.total)}</span>
                      </div>
                    )
                  })}
                  {totalLiabilities > 0 && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        <span>Debt</span>
                      </div>
                      <span className="font-medium text-red-500">-{fmtHome(totalLiabilities)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {totalPositiveAssets === 0 && (
              <p className="text-xs text-muted-foreground">
                Add investments or assets to see your net worth breakdown.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Investments value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fmtHome(totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stockPositions.length} position{stockPositions.length !== 1 ? "s" : ""} across {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Profit & Loss */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit & Loss</CardTitle>
            {totalPnl >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <div className={cn("text-2xl font-bold", totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
                {totalPnl >= 0 ? "+" : ""}{fmtHome(totalPnl)}
              </div>
              <p className={cn("text-xs", totalPnl >= 0 ? "text-green-500" : "text-red-500")}>
                {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}% all time
              </p>
            </div>
            <div className="border-t pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Today</span>
                <span className={cn("text-sm font-medium", dayChange >= 0 ? "text-green-500" : "text-red-500")}>
                  {dayChange >= 0 ? "+" : ""}{fmtHome(dayChange)} ({dayChangePct >= 0 ? "+" : ""}{dayChangePct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Net Worth History Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Net Worth Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthChart data={netWorthHistory} height={200} />
        </CardContent>
      </Card>

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
              <AllocationChart holdings={allocationHoldings} cashTotal={totalCash} fmtHome={fmtHome} />
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
                        {fmtNative(mover.price)}
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
                          {price > 0 ? fmtNative(price) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {total > 0 ? fmtHome(total) : "—"}
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

      {/* Market News */}
      {marketNews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              Market News
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {marketNews.map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 p-2 rounded-md hover:bg-accent transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {item.publisher}
                      </span>
                      {item.publishedAt && (
                        <>
                          <span className="text-xs text-muted-foreground/50">&middot;</span>
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(item.publishedAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 mt-1 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                          {fmtHome(value)}
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
                      <span className="text-sm font-medium">{fmtNative(item.price)}</span>
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

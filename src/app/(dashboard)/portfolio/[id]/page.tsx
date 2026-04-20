"use client"

import { useEffect, useState, Fragment, useMemo } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TickerSearch } from "@/components/ui/ticker-search"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, TrendingUp, TrendingDown, DollarSign, Briefcase, Upload, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BrokerConnectDialog } from "@/components/portfolio/broker-connect"
import { PositionDetailRow } from "@/components/portfolio/position-detail-row"
import { CsvExport } from "@/components/portfolio/csv-export"
import { TransactionFilters } from "@/components/portfolio/transaction-filters"
import { useCurrency } from "@/hooks/useCurrency"
import { PortfolioHealth } from "@/components/portfolio/portfolio-health"

interface Position {
  id: string
  symbol: string
  quantity: string
  average_cost: string
  asset_type: string
  opened_at: string
}

interface DividendTransaction {
  id: string
  symbol: string
  quantity: string
  price: string
  executed_at: string
}

interface TransactionForm {
  symbol: string
  action: "buy" | "sell" | "dividend"
  quantity: string
  price: string
}

export default function PortfolioDetailPage() {
  const params = useParams()
  const portfolioId = params.id as string
  const [portfolio, setPortfolio] = useState<{ name: string; is_paper: boolean } | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [dividends, setDividends] = useState<DividendTransaction[]>([])
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePct: number }>>({})
  const [plans, setPlans] = useState<Record<string, { id: string; state: string }>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [ibkrConnected, setIbkrConnected] = useState(false)
  const [akahuConnected, setAkahuConnected] = useState(false)
  const [form, setForm] = useState<TransactionForm>({ symbol: "", action: "buy", quantity: "", price: "" })
  const [loading, setLoading] = useState(true)
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set())
  const searchParams = useSearchParams()
  const { fmtNative, fmtHome, fmtBoth } = useCurrency()

  useEffect(() => {
    fetchData()
    // Check broker connections
    async function checkBrokers() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: connections } = await supabase
        .from("broker_connections")
        .select("broker")
        .eq("user_id", user.id)
      if (connections) {
        setIbkrConnected(connections.some((c) => c.broker === "ibkr"))
        if (connections.some((c) => c.broker === "akahu")) {
          setAkahuConnected(true)
        }
      }
      // Also check env-based Akahu personal token
      if (!connections?.some((c) => c.broker === "akahu")) {
        try {
          const res = await fetch("/api/brokers/akahu/status")
          if (res.ok) {
            const status = await res.json()
            if (status.connected) setAkahuConnected(true)
          }
        } catch { /* ignore */ }
      }
    }
    checkBrokers()
  }, [portfolioId])

  useEffect(() => {
    // Auto-open import dialog after broker OAuth callback
    if (searchParams.get("ibkr") === "connected") {
      setIbkrConnected(true)
      setImportDialogOpen(true)
    }
    if (searchParams.get("akahu") === "connected") {
      setAkahuConnected(true)
      setImportDialogOpen(true)
    }
  }, [searchParams])

  useEffect(() => {
    if (positions.length > 0) {
      fetchQuotes()
    }
  }, [positions])

  async function fetchData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [portfolioRes, positionsRes, dividendsRes] = await Promise.all([
      supabase.from("portfolios").select("name, is_paper").eq("id", portfolioId).eq("user_id", user.id).single(),
      supabase.from("portfolio_positions").select("*").eq("portfolio_id", portfolioId).eq("user_id", user.id).is("closed_at", null),
      supabase.from("transactions").select("id, symbol, quantity, price, executed_at").eq("portfolio_id", portfolioId).eq("user_id", user.id).eq("action", "dividend").order("executed_at", { ascending: false }),
    ])

    setPortfolio(portfolioRes.data)
    setPositions(positionsRes.data ?? [])
    setDividends(dividendsRes.data ?? [])
    setLoading(false)

    // Fetch plans in parallel (non-blocking)
    fetch("/api/plans").then((r) => r.ok ? r.json() : []).then((list) => {
      const map: Record<string, { id: string; state: string }> = {}
      for (const p of list ?? []) map[p.symbol] = { id: p.id, state: p.state }
      setPlans(map)
    }).catch(() => {})
  }

  async function refreshPlans() {
    try {
      const res = await fetch("/api/plans")
      if (!res.ok) return
      const list = await res.json()
      const map: Record<string, { id: string; state: string }> = {}
      for (const p of list ?? []) map[p.symbol] = { id: p.id, state: p.state }
      setPlans(map)
    } catch {}
  }

  async function fetchQuotes() {
    const symbols = positions.filter((p) => p.asset_type !== "cash").map((p) => p.symbol).join(",")
    if (!symbols) return
    try {
      const res = await fetch(`/api/market/quote?symbols=${symbols}`)
      if (res.ok) {
        const data = await res.json()
        const quoteMap: Record<string, { price: number; change: number; changePct: number }> = {}
        const list = Array.isArray(data) ? data : [data]
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

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const userId = await getCurrentUserId()

    const symbol = form.symbol.toUpperCase().trim()
    const quantity = parseFloat(form.quantity)
    const price = parseFloat(form.price)

    // Record transaction
    await supabase.from("transactions").insert({
      portfolio_id: portfolioId,
      user_id: userId,
      symbol,
      action: form.action,
      quantity: quantity.toString(),
      price: price.toString(),
    })

    // Dividends don't change position quantity
    if (form.action === "dividend") {
      setForm({ symbol: "", action: "buy", quantity: "", price: "" })
      setDialogOpen(false)
      fetchData()
      return
    }

    // Update or create position
    const existingPosition = positions.find((p) => p.symbol === symbol)

    if (existingPosition && form.action === "buy") {
      const oldQty = parseFloat(existingPosition.quantity)
      const oldCost = parseFloat(existingPosition.average_cost)
      const newQty = oldQty + quantity
      const newAvgCost = (oldQty * oldCost + quantity * price) / newQty

      await supabase
        .from("portfolio_positions")
        .update({
          quantity: newQty.toString(),
          average_cost: newAvgCost.toString(),
        })
        .eq("id", existingPosition.id)
    } else if (existingPosition && form.action === "sell") {
      const oldQty = parseFloat(existingPosition.quantity)
      const newQty = oldQty - quantity

      if (newQty <= 0) {
        await supabase
          .from("portfolio_positions")
          .update({ quantity: "0", closed_at: new Date().toISOString() })
          .eq("id", existingPosition.id)
      } else {
        await supabase
          .from("portfolio_positions")
          .update({ quantity: newQty.toString() })
          .eq("id", existingPosition.id)
      }
    } else if (form.action === "buy") {
      await supabase.from("portfolio_positions").insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol,
        quantity: quantity.toString(),
        average_cost: price.toString(),
        asset_type: "stock",
      })
    }

    setForm({ symbol: "", action: "buy", quantity: "", price: "" })
    setDialogOpen(false)
    fetchData()
  }

  function togglePositionExpand(positionId: string) {
    setExpandedPositions((prev) => {
      const next = new Set(prev)
      if (next.has(positionId)) {
        next.delete(positionId)
      } else {
        next.add(positionId)
      }
      return next
    })
  }

  // Split positions into stocks and cash
  const stockPositions = positions.filter((p) => p.asset_type !== "cash")
  const cashPositions = positions.filter((p) => p.asset_type === "cash")

  // Calculate totals (stocks only -- cash is separate)
  const totalValue = stockPositions.reduce((sum, p) => {
    const q = quotes[p.symbol]
    return sum + (q ? q.price * parseFloat(p.quantity) : 0)
  }, 0)

  const totalCost = stockPositions.reduce(
    (sum, p) => sum + parseFloat(p.average_cost) * parseFloat(p.quantity),
    0
  )

  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const totalCash = cashPositions.reduce(
    (sum, p) => sum + parseFloat(p.average_cost),
    0
  )

  // Day change calculation
  const totalDayChange = useMemo(() => {
    let dayChangeDollars = 0
    let previousTotalValue = 0
    stockPositions.forEach((p) => {
      const q = quotes[p.symbol]
      if (q) {
        const qty = parseFloat(p.quantity)
        dayChangeDollars += q.change * qty
        previousTotalValue += (q.price - q.change) * qty
      }
    })
    const dayChangePct = previousTotalValue > 0 ? (dayChangeDollars / previousTotalValue) * 100 : 0
    return { dollars: dayChangeDollars, percent: dayChangePct }
  }, [stockPositions, quotes])

  // Best & worst performers
  const performers = useMemo(() => {
    const positionsWithPnl = stockPositions
      .filter((p) => quotes[p.symbol] && parseFloat(p.quantity) > 0)
      .map((p) => {
        const q = quotes[p.symbol]
        const avgCost = parseFloat(p.average_cost)
        const pnlPct = avgCost > 0 ? ((q.price - avgCost) / avgCost) * 100 : 0
        return { symbol: p.symbol, pnlPct }
      })

    if (positionsWithPnl.length === 0) return { best: null, worst: null }

    const sorted = positionsWithPnl.sort((a, b) => b.pnlPct - a.pnlPct)
    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    }
  }, [stockPositions, quotes])

  // CSV export data
  const exportPositions = useMemo(() => {
    return stockPositions
      .filter((p) => parseFloat(p.quantity) > 0)
      .map((p) => {
        const qty = parseFloat(p.quantity)
        const avgCost = parseFloat(p.average_cost)
        const q = quotes[p.symbol]
        const currentPrice = q?.price ?? 0
        const marketValue = currentPrice * qty
        const pnl = (currentPrice - avgCost) * qty
        const pnlPct = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0
        return {
          symbol: p.symbol,
          quantity: qty,
          averageCost: avgCost,
          currentPrice,
          marketValue,
          pnl,
          pnlPct,
        }
      })
  }, [stockPositions, quotes])

  // Dividend calculations
  const totalDividends = dividends.reduce(
    (sum, d) => sum + parseFloat(d.quantity) * parseFloat(d.price),
    0
  )

  const currentYear = new Date().getFullYear()
  const dividendsThisYear = dividends
    .filter((d) => new Date(d.executed_at).getFullYear() === currentYear)
    .reduce((sum, d) => sum + parseFloat(d.quantity) * parseFloat(d.price), 0)

  const dividendYield = totalCost > 0 ? (totalDividends / totalCost) * 100 : 0

  // Group dividends by year
  const dividendsByYear = dividends.reduce<Record<number, DividendTransaction[]>>((acc, d) => {
    const year = new Date(d.executed_at).getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(d)
    return acc
  }, {})

  const sortedYears = Object.keys(dividendsByYear)
    .map(Number)
    .sort((a, b) => b - a)

  if (loading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {portfolio?.name ?? "Portfolio"}
            {portfolio?.is_paper && (
              <Badge variant="outline" className="ml-2 text-yellow-500 border-yellow-500">
                Paper
              </Badge>
            )}
          </h1>
        </div>
        <div className="flex gap-2">
          <CsvExport positions={exportPositions} portfolioName={portfolio?.name ?? "Portfolio"} />
          <Button variant="outline" size="sm" className="sm:size-auto" onClick={() => setImportDialogOpen(true)}>

            <Upload className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Import Holdings</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
            </DialogHeader>
            <form onSubmit={addTransaction} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Symbol</label>
                <TickerSearch
                  value={form.symbol}
                  onChange={(v) => setForm({ ...form, symbol: v })}
                  onSelect={(sym) => setForm({ ...form, symbol: sym })}
                  placeholder="e.g. AAPL"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={form.action === "buy" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setForm({ ...form, action: "buy" })}
                  >
                    Buy
                  </Button>
                  <Button
                    type="button"
                    variant={form.action === "sell" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setForm({ ...form, action: "sell" })}
                  >
                    Sell
                  </Button>
                  <Button
                    type="button"
                    variant={form.action === "dividend" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setForm({ ...form, action: "dividend" })}
                  >
                    Dividend
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {form.action === "dividend" ? "Shares (receiving)" : "Quantity"}
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder={form.action === "dividend" ? "100" : "10"}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {form.action === "dividend" ? "Per-share amount" : "Price per share"}
                  </label>
                  <Input
                    type="number"
                    step="any"
                    placeholder={form.action === "dividend" ? "0.82" : "150.00"}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                  />
                </div>
              </div>
              {form.action === "dividend" && (
                <p className="text-xs text-muted-foreground">
                  Total dividend: {form.quantity && form.price ? fmtNative(parseFloat(form.quantity) * parseFloat(form.price)) : "$0.00"}
                </p>
              )}
              <Button type="submit" className="w-full">
                {form.action === "buy" ? "Buy Shares" : form.action === "sell" ? "Sell Shares" : "Record Dividend"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>

        <BrokerConnectDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          portfolioId={portfolioId}
          onImportComplete={fetchData}
          ibkrConnected={ibkrConnected}
          akahuConnected={akahuConnected}
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtHome(totalValue)}</div>
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
            <div className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnl >= 0 ? "+" : ""}{fmtHome(Math.abs(totalPnl))}
            </div>
            <p className={`text-xs ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Day Change</CardTitle>
            {totalDayChange.dollars >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalDayChange.dollars >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalDayChange.dollars >= 0 ? "+" : ""}{fmtHome(Math.abs(totalDayChange.dollars))}
            </div>
            <p className={`text-xs ${totalDayChange.dollars >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalDayChange.percent >= 0 ? "+" : ""}{totalDayChange.percent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        {cashPositions.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cash</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmtHome(totalCash)}</div>
              <p className="text-xs text-muted-foreground">
                {cashPositions.length} currenc{cashPositions.length === 1 ? "y" : "ies"}
              </p>
            </CardContent>
          </Card>
        )}
        {performers.best && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Best Performer</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performers.best.symbol}</div>
              <p className={`text-xs ${performers.best.pnlPct >= 0 ? "text-green-500" : "text-red-500"}`}>
                {performers.best.pnlPct >= 0 ? "+" : ""}{performers.best.pnlPct.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
        )}
        {performers.worst && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Worst Performer</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{performers.worst.symbol}</div>
              <p className={`text-xs ${performers.worst.pnlPct >= 0 ? "text-green-500" : "text-red-500"}`}>
                {performers.worst.pnlPct >= 0 ? "+" : ""}{performers.worst.pnlPct.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stockPositions.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Health */}
      {stockPositions.length > 0 && (
        <PortfolioHealth portfolioId={portfolioId} />
      )}

      {/* Stock Positions table */}
      {stockPositions.length === 0 && cashPositions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No positions yet</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Get started by adding a transaction or importing holdings from your broker.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              You can manually record buys and sells, or connect a brokerage account.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Holdings
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : stockPositions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Market Value</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockPositions.map((pos) => {
                  const qty = parseFloat(pos.quantity)
                  const avgCost = parseFloat(pos.average_cost)
                  const q = quotes[pos.symbol]
                  const price = q?.price ?? 0
                  const marketValue = price * qty
                  const pnl = (price - avgCost) * qty
                  const pnlPct = avgCost > 0 ? ((price - avgCost) / avgCost) * 100 : 0
                  const isExpanded = expandedPositions.has(pos.id)

                  return (
                    <Fragment key={pos.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => togglePositionExpand(pos.id)}
                      >
                        <TableCell>
                          <Link
                            href={`/stock/${pos.symbol}`}
                            className="font-medium text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pos.symbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PlanBadge plan={plans[pos.symbol]} symbol={pos.symbol} />
                        </TableCell>
                        <TableCell className="text-right">{qty}</TableCell>
                        <TableCell className="text-right">{fmtNative(avgCost)}</TableCell>
                        <TableCell className="text-right">
                          {price > 0 ? fmtNative(price) : "\u2014"}
                        </TableCell>
                        <TableCell className="text-right">
                          {price > 0 ? fmtBoth(marketValue) : "\u2014"}
                        </TableCell>
                        <TableCell className={`text-right ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {price > 0 ? (
                            <>
                              {pnl >= 0 ? "+" : ""}{fmtHome(Math.abs(pnl))}
                              <br />
                              <span className="text-xs">
                                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                              </span>
                            </>
                          ) : "\u2014"}
                        </TableCell>
                        <TableCell className={`text-right ${(q?.change ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {q ? (
                            <>
                              {q.change >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%
                            </>
                          ) : "\u2014"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <PositionDetailRow
                          positionId={pos.id}
                          portfolioId={portfolioId}
                          symbol={pos.symbol}
                          quantity={qty}
                          averageCost={avgCost}
                          currentPrice={price}
                          colSpan={8}
                          onPlanChange={refreshPlans}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Cash Holdings */}
      {cashPositions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Cash Holdings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashPositions.map((pos) => {
                  const balance = parseFloat(pos.average_cost)
                  const currency = pos.symbol.replace("-CASH", "")
                  return (
                    <TableRow key={pos.id}>
                      <TableCell className="font-medium">{currency}</TableCell>
                      <TableCell className="text-right">{fmtNative(balance, currency)}</TableCell>
                    </TableRow>
                  )
                })}
                {cashPositions.length > 1 && (
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{fmtHome(totalCash)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dividend Summary Card */}
      {dividends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Dividend Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Dividends (All Time)</p>
                <p className="text-2xl font-bold text-green-500">{fmtHome(totalDividends)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dividends This Year</p>
                <p className="text-2xl font-bold">{fmtHome(dividendsThisYear)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dividend Yield (on Cost)</p>
                <p className="text-2xl font-bold">{dividendYield.toFixed(2)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dividend History */}
      {dividends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Dividend History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Per Share</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedYears.map((year) => {
                  const yearDividends = dividendsByYear[year]
                  const yearTotal = yearDividends.reduce(
                    (sum, d) => sum + parseFloat(d.quantity) * parseFloat(d.price),
                    0
                  )
                  return (
                    <Fragment key={`year-${year}`}>
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={4} className="font-semibold">{year}</TableCell>
                        <TableCell className="text-right font-semibold text-green-500">
                          {fmtHome(yearTotal)}
                        </TableCell>
                      </TableRow>
                      {yearDividends.map((d) => {
                        const amount = parseFloat(d.quantity) * parseFloat(d.price)
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="text-muted-foreground">
                              {new Date(d.executed_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="font-medium">{d.symbol}</TableCell>
                            <TableCell className="text-right">{fmtNative(parseFloat(d.price))}</TableCell>
                            <TableCell className="text-right">{parseFloat(d.quantity)}</TableCell>
                            <TableCell className="text-right text-green-500">{fmtHome(amount)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Transaction History with Filters */}
      <TransactionFilters portfolioId={portfolioId} />
    </div>
  )
}

function PlanBadge({ plan, symbol }: { plan: { id: string; state: string } | undefined; symbol: string }) {
  if (!plan) {
    return (
      <Link
        href={`/stock/${symbol}?openPlan=1`}
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-muted-foreground hover:text-primary hover:underline"
      >
        + Add plan
      </Link>
    )
  }
  const label = plan.state.replace("_", " ")
  const color =
    plan.state === "needs_attention" ? "bg-amber-500/15 text-amber-500 border-amber-500/30" :
    plan.state === "invalidated" ? "bg-red-500/15 text-red-500 border-red-500/30" :
    plan.state === "closed" ? "bg-muted text-muted-foreground border-border" :
    plan.state === "active" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" :
    "bg-blue-500/15 text-blue-500 border-blue-500/30" // drafted
  return (
    <Link
      href={`/stock/${symbol}?openPlan=1`}
      onClick={(e) => e.stopPropagation()}
      className={`text-[10px] px-1.5 py-0.5 rounded border capitalize whitespace-nowrap hover:opacity-80 transition-opacity ${color}`}
    >
      {label}
    </Link>
  )
}

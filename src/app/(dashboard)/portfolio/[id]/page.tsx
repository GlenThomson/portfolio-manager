"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Plus, TrendingUp, TrendingDown, DollarSign, Briefcase, Upload, Wallet } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BrokerConnectDialog } from "@/components/portfolio/broker-connect"

interface Position {
  id: string
  symbol: string
  quantity: string
  average_cost: string
  asset_type: string
  opened_at: string
}

interface TransactionForm {
  symbol: string
  action: "buy" | "sell"
  quantity: string
  price: string
}

export default function PortfolioDetailPage() {
  const params = useParams()
  const portfolioId = params.id as string
  const [portfolio, setPortfolio] = useState<{ name: string; is_paper: boolean } | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePct: number }>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [ibkrConnected, setIbkrConnected] = useState(false)
  const [form, setForm] = useState<TransactionForm>({ symbol: "", action: "buy", quantity: "", price: "" })
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()

  useEffect(() => {
    fetchData()
    // Check if IBKR is connected
    async function checkIbkr() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from("broker_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("broker", "ibkr")
        .limit(1)
        .single()
      if (data) setIbkrConnected(true)
    }
    checkIbkr()
  }, [portfolioId])

  useEffect(() => {
    // Auto-open import dialog after IBKR OAuth callback
    if (searchParams.get("ibkr") === "connected") {
      setIbkrConnected(true)
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

    const [portfolioRes, positionsRes] = await Promise.all([
      supabase.from("portfolios").select("name, is_paper").eq("id", portfolioId).eq("user_id", user.id).single(),
      supabase.from("portfolio_positions").select("*").eq("portfolio_id", portfolioId).eq("user_id", user.id).is("closed_at", null),
    ])

    setPortfolio(portfolioRes.data)
    setPositions(positionsRes.data ?? [])
    setLoading(false)
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

  // Split positions into stocks and cash
  const stockPositions = positions.filter((p) => p.asset_type !== "cash")
  const cashPositions = positions.filter((p) => p.asset_type === "cash")

  // Calculate totals (stocks only — cash is separate)
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

  if (loading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Holdings
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
                <Input
                  placeholder="e.g. AAPL"
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  required
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
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="10"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price per share</label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="150.00"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">
                {form.action === "buy" ? "Buy" : "Sell"} Shares
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
        />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(2)}</div>
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
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
            <p className={`text-xs ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%
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
              <div className="text-2xl font-bold">${totalCash.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {cashPositions.length} currenc{cashPositions.length === 1 ? "y" : "ies"}
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

      {/* Stock Positions table */}
      {stockPositions.length === 0 && cashPositions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No positions yet. Add your first transaction.</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Transaction
            </Button>
          </CardContent>
        </Card>
      ) : stockPositions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
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

                  return (
                    <TableRow key={pos.id}>
                      <TableCell>
                        <Link href={`/stock/${pos.symbol}`} className="font-medium text-primary hover:underline">
                          {pos.symbol}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{qty}</TableCell>
                      <TableCell className="text-right">${avgCost.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {price > 0 ? `$${price.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {price > 0 ? `$${marketValue.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {price > 0 ? (
                          <>
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            <br />
                            <span className="text-xs">
                              {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                            </span>
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className={`text-right ${(q?.change ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {q ? (
                          <>
                            {q.change >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%
                          </>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
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
                      <TableCell className="text-right">${balance.toFixed(2)}</TableCell>
                    </TableRow>
                  )
                })}
                {cashPositions.length > 1 && (
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">${totalCash.toFixed(2)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

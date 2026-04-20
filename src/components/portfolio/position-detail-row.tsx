"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { useCurrency } from "@/hooks/useCurrency"
import { PositionPlan } from "@/components/market/position-plan"

interface Transaction {
  id: string
  symbol: string
  action: string
  quantity: string
  price: string
  fees: string | null
  executed_at: string
}

interface PositionDetailRowProps {
  positionId: string
  portfolioId: string
  symbol: string
  quantity: number
  averageCost: number
  currentPrice: number
  colSpan: number
  onPlanChange?: () => void
}

export function PositionDetailRow({
  portfolioId,
  symbol,
  quantity,
  averageCost,
  currentPrice,
  colSpan,
  onPlanChange,
}: PositionDetailRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const { fmtNative, fmtHome } = useCurrency()

  async function handleToggle() {
    if (!expanded && !fetched) {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("transactions")
          .select("id, symbol, action, quantity, price, fees, executed_at")
          .eq("portfolio_id", portfolioId)
          .eq("symbol", symbol)
          .order("executed_at", { ascending: false })

        setTransactions(data ?? [])
        setFetched(true)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  // Cost basis calculations
  const totalCost = quantity * averageCost
  const marketValue = quantity * currentPrice
  const unrealizedPnl = marketValue - totalCost
  const unrealizedPnlPct = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0

  if (!expanded) {
    return (
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={handleToggle}
      >
        <TableCell colSpan={colSpan}>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <ChevronRight className="h-4 w-4" />
            <span>Click to view transaction details for {symbol}</span>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className="bg-slate-900/50 border-b-0">
      <TableCell colSpan={colSpan} className="p-0">
        <div className="px-6 py-4 space-y-4">
          {/* Header with collapse */}
          <div
            className="flex items-center gap-2 cursor-pointer text-sm font-medium"
            onClick={handleToggle}
          >
            <ChevronDown className="h-4 w-4" />
            <span>{symbol} Position Details</span>
          </div>

          {/* Position Plan (inline editor) */}
          <PositionPlan symbol={symbol} currentPrice={currentPrice} onChange={onPlanChange} />

          {/* Cost Basis & P&L Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-sm font-medium">{fmtHome(totalCost)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Cost / Share</p>
              <p className="text-sm font-medium">{fmtNative(averageCost)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <p className={`text-sm font-medium ${unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {unrealizedPnl >= 0 ? "+" : ""}{fmtHome(Math.abs(unrealizedPnl))}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">P&L %</p>
              <p className={`text-sm font-medium ${unrealizedPnlPct >= 0 ? "text-green-500" : "text-red-500"}`}>
                {unrealizedPnlPct >= 0 ? "+" : ""}{unrealizedPnlPct.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Transactions Table */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Transaction History</p>
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading transactions...
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No transactions found.</p>
            ) : (
              <div className="rounded-md border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Action</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Quantity</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Price</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Fees</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const txQty = parseFloat(tx.quantity)
                      const txPrice = parseFloat(tx.price)
                      const txFees = parseFloat(tx.fees ?? "0")
                      const txTotal = txQty * txPrice + txFees

                      return (
                        <tr key={tx.id} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-3 py-2">
                            {new Date(tx.executed_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={
                                tx.action === "buy"
                                  ? "text-green-500 border-green-500/50"
                                  : tx.action === "sell"
                                  ? "text-red-500 border-red-500/50"
                                  : tx.action === "dividend"
                                  ? "text-blue-500 border-blue-500/50"
                                  : "text-muted-foreground"
                              }
                            >
                              {tx.action.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{txQty}</td>
                          <td className="px-3 py-2 text-right">{fmtNative(txPrice)}</td>
                          <td className="px-3 py-2 text-right">{fmtNative(txFees)}</td>
                          <td className="px-3 py-2 text-right">{fmtHome(txTotal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
import { Search, X, ArrowUpDown } from "lucide-react"

interface Transaction {
  id: string
  symbol: string
  action: string
  quantity: string
  price: string
  fees: string | null
  executed_at: string
}

interface TransactionFiltersProps {
  portfolioId: string
}

type SortDirection = "asc" | "desc"

export function TransactionFilters({ portfolioId }: TransactionFiltersProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [symbolFilter, setSymbolFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [sortDir, setSortDir] = useState<SortDirection>("desc")

  useEffect(() => {
    fetchTransactions()
  }, [portfolioId])

  async function fetchTransactions() {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from("transactions")
        .select("id, symbol, action, quantity, price, fees, executed_at")
        .eq("portfolio_id", portfolioId)
        .order("executed_at", { ascending: false })

      setTransactions(data ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  // Unique symbols for dropdown
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(transactions.map((t) => t.symbol))
    return Array.from(symbols).sort()
  }, [transactions])

  // Filtered + sorted transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions]

    // Symbol filter (dropdown)
    if (symbolFilter) {
      result = result.filter((t) => t.symbol === symbolFilter)
    }

    // Search query (partial match)
    if (searchQuery) {
      const q = searchQuery.toUpperCase()
      result = result.filter((t) => t.symbol.includes(q))
    }

    // Action filter
    if (actionFilter) {
      result = result.filter((t) => t.action === actionFilter)
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter((t) => new Date(t.executed_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter((t) => new Date(t.executed_at) <= to)
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.executed_at).getTime()
      const dateB = new Date(b.executed_at).getTime()
      return sortDir === "desc" ? dateB - dateA : dateA - dateB
    })

    return result
  }, [transactions, symbolFilter, searchQuery, actionFilter, dateFrom, dateTo, sortDir])

  function clearFilters() {
    setSymbolFilter("")
    setSearchQuery("")
    setActionFilter("")
    setDateFrom("")
    setDateTo("")
  }

  const hasFilters = symbolFilter || searchQuery || actionFilter || dateFrom || dateTo

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    )
  }

  if (transactions.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter Controls */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Symbol Search */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Search Symbol</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-40 h-9"
              />
            </div>
          </div>

          {/* Symbol Dropdown */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <select
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All</option>
              {uniqueSymbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 h-9"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 h-9"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          {filteredTransactions.length} of {transactions.length} transactions
        </p>

        {/* Transactions Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No transactions match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => {
                  const txQty = parseFloat(tx.quantity)
                  const txPrice = parseFloat(tx.price)
                  const txFees = parseFloat(tx.fees ?? "0")
                  const txTotal = txQty * txPrice + txFees

                  return (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {new Date(tx.executed_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{tx.symbol}</TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right">{txQty}</TableCell>
                      <TableCell className="text-right">${txPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${txFees.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${txTotal.toFixed(2)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

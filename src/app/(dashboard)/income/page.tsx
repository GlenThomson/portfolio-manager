"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DollarSign, TrendingUp, BarChart3 } from "lucide-react"

interface DividendRecord {
  id: string
  symbol: string
  quantity: string
  price: string
  executed_at: string
  portfolio_id: string
}

interface PortfolioInfo {
  id: string
  name: string
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function IncomePage() {
  const [dividends, setDividends] = useState<DividendRecord[]>([])
  const [portfolios, setPortfolios] = useState<PortfolioInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [dividendsRes, portfoliosRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, symbol, quantity, price, executed_at, portfolio_id")
        .eq("user_id", user.id)
        .eq("action", "dividend")
        .order("executed_at", { ascending: false }),
      supabase.from("portfolios").select("id, name").eq("user_id", user.id),
    ])

    setDividends(dividendsRes.data ?? [])
    setPortfolios(portfoliosRes.data ?? [])
    setLoading(false)
  }

  const currentYear = new Date().getFullYear()

  // YTD income
  const ytdDividends = dividends.filter(
    (d) => new Date(d.executed_at).getFullYear() === currentYear
  )
  const totalIncomeYTD = ytdDividends.reduce(
    (sum, d) => sum + parseFloat(d.quantity) * parseFloat(d.price),
    0
  )

  // Monthly breakdown for current year
  const monthlyIncome = Array(12).fill(0)
  ytdDividends.forEach((d) => {
    const month = new Date(d.executed_at).getMonth()
    monthlyIncome[month] += parseFloat(d.quantity) * parseFloat(d.price)
  })

  const currentMonth = new Date().getMonth() + 1
  const monthlyAverage = currentMonth > 0 ? totalIncomeYTD / currentMonth : 0

  // Top dividend payer
  const payerTotals: Record<string, number> = {}
  dividends.forEach((d) => {
    const amount = parseFloat(d.quantity) * parseFloat(d.price)
    payerTotals[d.symbol] = (payerTotals[d.symbol] ?? 0) + amount
  })
  const topPayer = Object.entries(payerTotals).sort((a, b) => b[1] - a[1])[0]

  // Portfolio name map
  const portfolioMap: Record<string, string> = {}
  portfolios.forEach((p) => {
    portfolioMap[p.id] = p.name
  })

  // Chart scaling
  const maxMonthly = Math.max(...monthlyIncome, 1)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Income</h1>
        <p className="text-muted-foreground">
          Dividend income across all portfolios.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income YTD</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              ${totalIncomeYTD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{currentYear}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${monthlyAverage.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Per month this year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Dividend Payer</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {topPayer ? (
              <>
                <div className="text-2xl font-bold">{topPayer[0]}</div>
                <p className="text-xs text-muted-foreground">
                  ${topPayer[1].toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total
                </p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Dividend Income ({currentYear})</CardTitle>
        </CardHeader>
        <CardContent>
          {totalIncomeYTD === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No dividend income recorded this year.
            </div>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {monthlyIncome.map((amount, i) => {
                const barHeight = maxMonthly > 0 ? (amount / maxMonthly) * 100 : 0
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {amount > 0 ? `$${amount.toFixed(0)}` : ""}
                    </span>
                    <div className="w-full flex items-end" style={{ height: "160px" }}>
                      <svg width="100%" height="160" className="overflow-visible">
                        <rect
                          x="15%"
                          y={160 - (barHeight / 100) * 160}
                          width="70%"
                          height={Math.max((barHeight / 100) * 160, amount > 0 ? 2 : 0)}
                          rx="3"
                          className="fill-green-500"
                        />
                      </svg>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{MONTH_LABELS[i]}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All dividend transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Dividend Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dividends.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No dividend transactions recorded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Portfolio</TableHead>
                  <TableHead className="text-right">Per Share</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.map((d) => {
                  const amount = parseFloat(d.quantity) * parseFloat(d.price)
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(d.executed_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{d.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {portfolioMap[d.portfolio_id] ?? "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">${parseFloat(d.price).toFixed(4)}</TableCell>
                      <TableCell className="text-right">{parseFloat(d.quantity)}</TableCell>
                      <TableCell className="text-right text-green-500">${amount.toFixed(2)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

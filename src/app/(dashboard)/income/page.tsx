"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DollarSign, TrendingUp, BarChart3, Plus, Trash2, RefreshCw, Inbox, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/hooks/useCurrency"

// ── Types ──────────────────────────────────────────────

interface DividendRecord {
  id: string
  symbol: string
  quantity: string
  price: string
  executed_at: string
  portfolio_id: string
}

interface IncomeEntry {
  id: string
  source: string
  category: string
  amount: number
  currency: string
  date: string
  recurring: boolean
  frequency: string | null
  notes: string | null
  origin: string
  bank_ref: string | null
  needs_review: boolean
}

interface PortfolioInfo {
  id: string
  name: string
}

// Unified income item for display
interface IncomeItem {
  id: string
  date: string
  source: string
  category: string
  amount: number
  origin: "dividend" | "manual" | "bank"
  needsReview?: boolean
  notes?: string | null
}

const CATEGORIES = [
  { value: "dividend", label: "Dividend", color: "text-green-400 border-green-500/30" },
  { value: "salary", label: "Salary", color: "text-blue-400 border-blue-500/30" },
  { value: "rental", label: "Rental", color: "text-purple-400 border-purple-500/30" },
  { value: "interest", label: "Interest", color: "text-cyan-400 border-cyan-500/30" },
  { value: "side-income", label: "Side Income", color: "text-orange-400 border-orange-500/30" },
  { value: "other", label: "Other", color: "text-gray-400 border-gray-500/30" },
]

const CATEGORY_COLORS: Record<string, string> = {
  dividend: "bg-green-500",
  salary: "bg-blue-500",
  rental: "bg-purple-500",
  interest: "bg-cyan-500",
  "side-income": "bg-orange-500",
  other: "bg-gray-500",
}

function getCategoryConfig(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[5]
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function IncomePage() {
  const [dividends, setDividends] = useState<DividendRecord[]>([])
  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([])
  const [portfolios, setPortfolios] = useState<PortfolioInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>("all")
  const { fmtNative, fmtHome } = useCurrency()

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [dividendsRes, portfoliosRes, incomeRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, symbol, quantity, price, executed_at, portfolio_id")
        .eq("user_id", user.id)
        .eq("action", "dividend")
        .order("executed_at", { ascending: false }),
      supabase.from("portfolios").select("id, name").eq("user_id", user.id),
      fetch("/api/income").then((r) => r.ok ? r.json() : []),
    ])

    setDividends(dividendsRes.data ?? [])
    setPortfolios(portfoliosRes.data ?? [])
    setIncomeEntries(incomeRes)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Merge dividends + manual income into unified list
  const allIncome: IncomeItem[] = [
    ...dividends.map((d) => ({
      id: d.id,
      date: d.executed_at,
      source: d.symbol,
      category: "dividend",
      amount: parseFloat(d.quantity) * parseFloat(d.price),
      origin: "dividend" as const,
    })),
    ...incomeEntries.map((e) => ({
      id: e.id,
      date: e.date,
      source: e.source,
      category: e.category,
      amount: Number(e.amount),
      origin: (e.origin === "bank" ? "bank" : "manual") as "bank" | "manual",
      needsReview: e.needs_review,
      notes: e.notes,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredIncome = activeFilter === "all"
    ? allIncome
    : allIncome.filter((i) => i.category === activeFilter)

  const currentYear = new Date().getFullYear()
  const ytdIncome = allIncome.filter((i) => new Date(i.date).getFullYear() === currentYear)
  const totalIncomeYTD = ytdIncome.reduce((sum, i) => sum + i.amount, 0)

  // Monthly breakdown by category for current year
  const monthlyByCategory: Record<string, number[]> = {}
  for (const cat of CATEGORIES) {
    monthlyByCategory[cat.value] = Array(12).fill(0)
  }
  ytdIncome.forEach((i) => {
    const month = new Date(i.date).getMonth()
    if (monthlyByCategory[i.category]) {
      monthlyByCategory[i.category][month] += i.amount
    }
  })

  const monthlyTotals = Array(12).fill(0)
  ytdIncome.forEach((i) => {
    monthlyTotals[new Date(i.date).getMonth()] += i.amount
  })

  const currentMonth = new Date().getMonth() + 1
  const monthlyAverage = currentMonth > 0 ? totalIncomeYTD / currentMonth : 0

  // Top income source
  const sourceTotals: Record<string, number> = {}
  allIncome.forEach((i) => {
    sourceTotals[i.source] = (sourceTotals[i.source] ?? 0) + i.amount
  })
  const topSource = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0]

  // Chart scaling
  const maxMonthly = Math.max(...monthlyTotals, 1)

  // Category breakdown for YTD
  const categoryTotals: Record<string, number> = {}
  ytdIncome.forEach((i) => {
    categoryTotals[i.category] = (categoryTotals[i.category] ?? 0) + i.amount
  })

  const handleDeleteIncome = async (id: string) => {
    const res = await fetch(`/api/income?id=${id}`, { method: "DELETE" })
    if (res.ok) {
      setIncomeEntries((prev) => prev.filter((e) => e.id !== id))
    }
  }

  const handleBankSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/brokers/akahu/sync-bank", { method: "POST" })
      if (res.ok) {
        const result = await res.json()
        setSyncMessage(
          `Synced: ${result.incomeImported} income entries, ${result.balancesUpdated} balances updated.${result.needsReview > 0 ? ` ${result.needsReview} need review.` : ""}`
        )
        fetchData()
      } else {
        const err = await res.json()
        setSyncMessage(`Error: ${err.error}`)
      }
    } catch {
      setSyncMessage("Error: Network error")
    }
    setSyncing(false)
  }

  const handleCategorise = async (id: string, category: string, source: string) => {
    const res = await fetch("/api/income", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category, source }),
    })
    if (res.ok) {
      // Also create a rule so future transactions auto-categorise
      const entry = incomeEntries.find((e) => e.id === id)
      if (entry?.notes) {
        // Generate pattern from original description
        const pattern = entry.notes
          .replace(/\d{2}\/\d{2}\/\d{2,4}/g, "")
          .replace(/\d{4,}/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase()
        if (pattern.length > 2) {
          await fetch("/api/income/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ match_pattern: pattern, category, source_label: source }),
          })
        }
      }
      setIncomeEntries((prev) =>
        prev.map((e) => e.id === id ? { ...e, category, needs_review: false, source } : e)
      )
    }
  }

  const handleDismissReview = async (id: string) => {
    // Mark as reviewed without changing category
    await fetch("/api/income", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category: incomeEntries.find((e) => e.id === id)?.category ?? "other" }),
    })
    setIncomeEntries((prev) =>
      prev.map((e) => e.id === id ? { ...e, needs_review: false } : e)
    )
  }

  // Items needing review
  const reviewItems = allIncome.filter((i) => i.needsReview)

  const portfolioMap: Record<string, string> = {}
  portfolios.forEach((p) => { portfolioMap[p.id] = p.name })

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Income</h1>
          <p className="text-muted-foreground">
            All income sources — dividends, salary, rental, and more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBankSync} disabled={syncing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Syncing..." : "Sync Bank"}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Income
          </Button>
        </div>
      </div>

      {/* Sync status message */}
      {syncMessage && (
        <div className={cn(
          "flex items-center justify-between px-4 py-2 rounded-md text-sm",
          syncMessage.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
        )}>
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income YTD</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {fmtHome(totalIncomeYTD)}
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
              {fmtHome(monthlyAverage)}
            </div>
            <p className="text-xs text-muted-foreground">Per month this year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Source</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {topSource ? (
              <>
                <div className="text-2xl font-bold">{topSource[0]}</div>
                <p className="text-xs text-muted-foreground">
                  {fmtHome(topSource[1])} total
                </p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown pills */}
      {Object.keys(categoryTotals).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => categoryTotals[c.value]).map((c) => (
            <div
              key={c.value}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-xs"
            >
              <div className={cn("w-2 h-2 rounded-full", CATEGORY_COLORS[c.value])} />
              <span className="font-medium">{c.label}</span>
              <span className="text-muted-foreground">{fmtHome(categoryTotals[c.value])}</span>
            </div>
          ))}
        </div>
      )}

      {/* Review inbox */}
      {reviewItems.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-yellow-500" />
              Needs Review ({reviewItems.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Categorise these transactions. Your choice will be remembered for future imports.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewItems.slice(0, 10).map((item) => (
              <div
                key={`review-${item.id}`}
                className="flex items-center gap-3 p-3 rounded-md bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.source}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(item.date).toLocaleDateString()}</span>
                    <span className="text-green-500 font-medium">{fmtHome(item.amount)}</span>
                    {item.notes && <span className="truncate max-w-[200px]">{item.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {CATEGORIES.filter((c) => c.value !== "dividend").map((c) => (
                    <button
                      key={c.value}
                      onClick={() => handleCategorise(item.id, c.value, item.source)}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md font-medium transition-colors",
                        "bg-muted hover:bg-accent text-muted-foreground border border-transparent",
                        item.category === c.value && "border-primary/30 text-primary"
                      )}
                      title={c.label}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDismissReview(item.id)}
                    className="px-1.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Accept current category"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteIncome(item.id)}
                    className="px-1.5 py-1 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {reviewItems.length > 10 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                And {reviewItems.length - 10} more...
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly bar chart — stacked by category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Income ({currentYear})</CardTitle>
        </CardHeader>
        <CardContent>
          {totalIncomeYTD === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No income recorded this year.
            </div>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {monthlyTotals.map((total, i) => {
                const barHeight = maxMonthly > 0 ? (total / maxMonthly) * 100 : 0
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {total > 0 ? fmtHome(total) : ""}
                    </span>
                    <div className="w-full flex items-end" style={{ height: "160px" }}>
                      <svg width="100%" height="160" className="overflow-visible">
                        {/* Stacked bars by category */}
                        {(() => {
                          let yOffset = 0
                          const segments: { y: number; h: number; color: string }[] = []
                          for (const cat of CATEGORIES) {
                            const catAmount = monthlyByCategory[cat.value]?.[i] ?? 0
                            if (catAmount <= 0) continue
                            const h = (catAmount / maxMonthly) * 160
                            segments.push({ y: 160 - yOffset - h, h, color: CATEGORY_COLORS[cat.value] })
                            yOffset += h
                          }
                          return segments.map((seg, j) => (
                            <rect
                              key={j}
                              x="15%"
                              y={seg.y}
                              width="70%"
                              height={Math.max(seg.h, 1)}
                              rx={j === segments.length - 1 ? 3 : 0}
                              className={seg.color}
                            />
                          ))
                        })()}
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

      {/* Filter tabs + income list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Income</CardTitle>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveFilter("all")}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                activeFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveFilter(c.value)}
                className={cn(
                  "px-2 py-1 text-xs rounded-md transition-colors",
                  activeFilter === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredIncome.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No income recorded yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncome.map((item) => {
                  const catConfig = getCategoryConfig(item.category)
                  return (
                    <TableRow key={`${item.origin}-${item.id}`}>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{item.source}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", catConfig.color)}>
                          {catConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-500">
                        {fmtHome(item.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {item.origin === "bank" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-400">
                              Bank
                            </Badge>
                          )}
                          {item.origin !== "dividend" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-400"
                              onClick={() => handleDeleteIncome(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Income Dialog */}
      <AddIncomeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setDialogOpen(false)
          fetchData()
        }}
      />
    </div>
  )
}

// ── Add Income Dialog ────────────────────────────────

function AddIncomeDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [source, setSource] = useState("")
  const [category, setCategory] = useState("salary")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [recurring, setRecurring] = useState(false)
  const [frequency, setFrequency] = useState("monthly")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setSource("")
      setAmount("")
      setDate(new Date().toISOString().split("T")[0])
      setRecurring(false)
      setNotes("")
      setError("")
    }
  }, [open])

  const handleSave = async () => {
    if (!source.trim()) return setError("Source is required")
    if (!amount || isNaN(Number(amount))) return setError("Valid amount is required")

    setSaving(true)
    setError("")

    const res = await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: source.trim(),
        category,
        amount: Number(amount),
        date,
        recurring,
        frequency: recurring ? frequency : null,
        notes: notes.trim() || null,
      }),
    })

    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json()
      setError(data.error ?? "Failed to save")
    }
  }

  // Filter out dividend since those come from transactions
  const manualCategories = CATEGORIES.filter((c) => c.value !== "dividend")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Income</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Category</label>
            <div className="grid grid-cols-2 gap-1.5">
              {manualCategories.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                    category === c.value
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-muted hover:bg-accent text-muted-foreground border border-transparent"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", CATEGORY_COLORS[c.value])} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="income-source" className="text-sm font-medium">Source</label>
            <Input
              id="income-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={category === "salary" ? "e.g. Employer Name" : "e.g. 42 Queen St rental"}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="income-amount" className="text-sm font-medium">Amount</label>
              <Input
                id="income-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="income-date" className="text-sm font-medium">Date</label>
              <Input
                id="income-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="rounded"
              />
              Recurring
            </label>
            {recurring && (
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            )}
          </div>

          <div>
            <label htmlFor="income-notes" className="text-sm font-medium">Notes</label>
            <Input
              id="income-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="mt-1"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Add Income"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

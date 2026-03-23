"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  Briefcase,
  Home,
  Car,
  Wallet,
  Bitcoin,
  PiggyBank,
  Package,
  Building2,
  Banknote,
  CreditCard,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Landmark,
  RefreshCw,
  X,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"
import { useCurrency } from "@/hooks/useCurrency"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────

interface Portfolio {
  id: string
  name: string
  currency: string
  is_paper: boolean
  created_at: string
}

interface PortfolioSummary {
  positionCount: number
  totalValue: number
  cashTotal: number
}

interface Position {
  symbol: string
  quantity: string
  average_cost: string
  portfolio_id: string
  asset_type?: string
}

interface Asset {
  id: string
  name: string
  type: string
  value: number
  currency: string
  address: string | null
  purchase_price: number | null
  purchase_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

const TABS = [
  { id: "portfolios", label: "Portfolios" },
  { id: "positions", label: "All Positions" },
  { id: "assets", label: "Other Assets" },
] as const

// Asset type config
const ASSET_TYPES = [
  { value: "property", label: "Property", icon: Home, isLiability: false },
  { value: "vehicle", label: "Vehicle", icon: Car, isLiability: false },
  { value: "cash", label: "Cash / Savings", icon: Wallet, isLiability: false },
  { value: "crypto", label: "Crypto Wallet", icon: Bitcoin, isLiability: false },
  { value: "kiwisaver", label: "KiwiSaver / Retirement", icon: PiggyBank, isLiability: false },
  { value: "other-asset", label: "Other Asset", icon: Package, isLiability: false },
  { value: "mortgage", label: "Mortgage", icon: Building2, isLiability: true },
  { value: "loan", label: "Loan", icon: Banknote, isLiability: true },
  { value: "credit-card", label: "Credit Card", icon: CreditCard, isLiability: true },
  { value: "other-liability", label: "Other Liability", icon: Banknote, isLiability: true },
]

const LIABILITY_TYPES = new Set(ASSET_TYPES.filter((t) => t.isLiability).map((t) => t.value))
function getTypeConfig(type: string) { return ASSET_TYPES.find((t) => t.value === type) ?? ASSET_TYPES[5] }
function isLiability(type: string) { return LIABILITY_TYPES.has(type) }

// ── Main Component ─────────────────────────────────────

export default function InvestmentsPage() {
  const [activeTab, setActiveTab] = useState<string>("portfolios")
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [summaries, setSummaries] = useState<Record<string, PortfolioSummary>>({})
  const [allPositions, setAllPositions] = useState<(Position & { currentPrice?: number })[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [newName, setNewName] = useState("")
  const [isPaper, setIsPaper] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")
  const [akahuConnected, setAkahuConnected] = useState<boolean | null>(null)
  const [akahuConnectOpen, setAkahuConnectOpen] = useState(false)
  const [akahuAppToken, setAkahuAppToken] = useState("")
  const [akahuUserToken, setAkahuUserToken] = useState("")
  const [connecting, setConnecting] = useState(false)
  const { fmtHome, fmtLocal, homeCurrency, fxRate } = useCurrency()

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Check Akahu connection status
    fetch("/api/brokers/akahu/status")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setAkahuConnected(d.connected) })
      .catch(() => {})

    const [portfolioRes, positionsRes, assetsRes] = await Promise.all([
      supabase.from("portfolios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("portfolio_positions").select("symbol, quantity, average_cost, portfolio_id, asset_type").eq("user_id", user.id).is("closed_at", null),
      fetch("/api/assets").then((r) => r.ok ? r.json() : []),
    ])

    const portfolioList = portfolioRes.data ?? []
    const positions = positionsRes.data ?? []
    setPortfolios(portfolioList)
    setAssets(assetsRes)

    // Fetch prices for all stock positions
    const stockPositions = positions.filter((p: Position) => p.asset_type !== "cash")
    const symbols = Array.from(new Set(stockPositions.map((p: Position) => p.symbol)))

    const priceMap: Record<string, number> = {}
    if (symbols.length > 0) {
      try {
        const res = await fetch(`/api/market/quote?symbols=${symbols.join(",")}`)
        if (res.ok) {
          const data = await res.json()
          const quotes = Array.isArray(data) ? data : [data]
          for (const q of quotes) {
            if (q?.symbol && q?.regularMarketPrice) priceMap[q.symbol] = q.regularMarketPrice
          }
        }
      } catch {}
    }

    // Build portfolio summaries
    const sums: Record<string, PortfolioSummary> = {}
    for (const p of portfolioList) sums[p.id] = { positionCount: 0, totalValue: 0, cashTotal: 0 }
    for (const pos of positions) {
      const s = sums[pos.portfolio_id]
      if (!s) continue
      if (pos.asset_type === "cash") {
        s.cashTotal += parseFloat(pos.average_cost)
      } else {
        s.positionCount++
        s.totalValue += parseFloat(pos.quantity) * (priceMap[pos.symbol] ?? parseFloat(pos.average_cost))
      }
    }
    setSummaries(sums)

    // All positions with current prices
    setAllPositions(
      stockPositions.map((p: Position) => ({ ...p, currentPrice: priceMap[p.symbol] }))
    )

    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function createPortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const supabase = createClient()
    const userId = await getCurrentUserId()
    const { error } = await supabase.from("portfolios").insert({
      user_id: userId, name: newName.trim(), currency: "USD", is_paper: isPaper,
    })
    if (!error) {
      setNewName(""); setIsPaper(false); setDialogOpen(false); fetchData()
    }
  }

  const handleDeleteAsset = async (id: string) => {
    const res = await fetch(`/api/assets?id=${id}`, { method: "DELETE" })
    if (res.ok) setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  const handleBankSync = async () => {
    if (akahuConnected === false) {
      setAkahuConnectOpen(true)
      return
    }
    setSyncing(true)
    setSyncMessage("")
    try {
      const res = await fetch("/api/brokers/akahu/sync-bank", { method: "POST" })
      if (res.ok) {
        const result = await res.json()
        setSyncMessage(`Synced: ${result.balancesUpdated} bank balance${result.balancesUpdated !== 1 ? "s" : ""} updated.`)
        fetchData()
      } else {
        const err = await res.json()
        if (res.status === 400) {
          setAkahuConnectOpen(true)
        } else {
          setSyncMessage(`Error: ${err.error}`)
        }
      }
    } catch {
      setSyncMessage("Error: Network error")
    }
    setSyncing(false)
  }

  const handleAkahuConnect = async () => {
    if (!akahuAppToken.trim() || !akahuUserToken.trim()) return
    setConnecting(true)
    setSyncMessage("")
    try {
      const res = await fetch("/api/brokers/akahu/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appToken: akahuAppToken.trim(), userToken: akahuUserToken.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setSyncMessage(`Error: ${data.error || "Failed to connect"}`)
        setConnecting(false)
        return
      }
      setAkahuAppToken("")
      setAkahuUserToken("")
      setAkahuConnectOpen(false)
      setAkahuConnected(true)
      // Auto-sync after connecting
      setSyncing(true)
      const syncRes = await fetch("/api/brokers/akahu/sync-bank", { method: "POST" })
      if (syncRes.ok) {
        const result = await syncRes.json()
        setSyncMessage(`Connected! ${result.balancesUpdated} bank balance${result.balancesUpdated !== 1 ? "s" : ""} synced.`)
        fetchData()
      }
    } catch {
      setSyncMessage("Error: Network error")
    }
    setConnecting(false)
    setSyncing(false)
  }

  // Portfolio name lookup
  const portfolioMap = new Map(portfolios.map((p) => [p.id, p.name]))

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investments</h1>
          <p className="text-muted-foreground">Manage your portfolios and assets</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "assets" ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBankSync} disabled={syncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
                {syncing ? "Syncing..." : "Sync Bank"}
              </Button>
              <Button onClick={() => { setEditingAsset(null); setAssetDialogOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Asset
              </Button>
            </div>
          ) : (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Portfolio
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Portfolio</DialogTitle>
                </DialogHeader>
                <form onSubmit={createPortfolio} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input placeholder="e.g. Growth Portfolio" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="paper" checked={isPaper} onChange={(e) => setIsPaper(e.target.checked)} className="rounded" />
                    <label htmlFor="paper" className="text-sm">Paper trading (simulated)</label>
                  </div>
                  <Button type="submit" className="w-full">Create</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "portfolios" && (
        <>
          {portfolios.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Briefcase className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No portfolios yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first portfolio to start tracking investments.
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Portfolio
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {portfolios.map((portfolio) => (
                <Link key={portfolio.id} href={`/portfolio/${portfolio.id}`}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                        {portfolio.is_paper && (
                          <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">Paper</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const s = summaries[portfolio.id]
                        const total = (s?.totalValue ?? 0) + (s?.cashTotal ?? 0)
                        return (
                          <>
                            <p className="text-2xl font-bold">{fmtHome(total)}</p>
                            <p className="text-sm text-muted-foreground">
                              {s?.positionCount ?? 0} position{(s?.positionCount ?? 0) !== 1 ? "s" : ""}
                              {(s?.cashTotal ?? 0) > 0 && ` · ${fmtHome(s!.cashTotal)} cash`}
                            </p>
                          </>
                        )
                      })()}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "positions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Positions Across Portfolios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {allPositions.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No positions yet. Add trades to your portfolios to see them here.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Portfolio</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPositions.map((pos, i) => {
                    const qty = parseFloat(pos.quantity)
                    const avgCost = parseFloat(pos.average_cost)
                    const price = pos.currentPrice ?? avgCost
                    const value = qty * price
                    const cost = qty * avgCost
                    const pnl = value - cost
                    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0

                    return (
                      <TableRow key={`${pos.symbol}-${pos.portfolio_id}-${i}`}>
                        <TableCell>
                          <Link href={`/stock/${pos.symbol}`} className="font-medium text-primary hover:underline">
                            {pos.symbol}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {portfolioMap.get(pos.portfolio_id) ?? "Unknown"}
                        </TableCell>
                        <TableCell className="text-right">{qty.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmtHome(avgCost)}</TableCell>
                        <TableCell className="text-right">{fmtHome(price)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtHome(value)}</TableCell>
                        <TableCell className={cn("text-right", pnl >= 0 ? "text-green-500" : "text-red-500")}>
                          {pnl >= 0 ? "+" : ""}{fmtHome(pnl)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "assets" && (
        <>
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

          {/* Asset summary cards */}
          {assets.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">
                    {fmtLocal(assets.filter((a) => !isLiability(a.type)).reduce((s, a) => s + Number(a.value), 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-500">
                    {fmtLocal(assets.filter((a) => isLiability(a.type)).reduce((s, a) => s + Number(a.value), 0))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net (excl. investments)</CardTitle>
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {fmtLocal(
                      assets.filter((a) => !isLiability(a.type)).reduce((s, a) => s + Number(a.value), 0) -
                      assets.filter((a) => isLiability(a.type)).reduce((s, a) => s + Number(a.value), 0)
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Assets table */}
          {assets.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Purchase Price</TableHead>
                      <TableHead className="text-right">Gain/Loss</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((a) => {
                      const config = getTypeConfig(a.type)
                      const Icon = config.icon
                      const isLiab = isLiability(a.type)
                      const val = Number(a.value)
                      const purchasePrice = a.purchase_price ? Number(a.purchase_price) : null
                      const gain = purchasePrice ? val - purchasePrice : null

                      return (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="font-medium">{a.name}</span>
                                {a.address && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{a.address}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", isLiab ? "border-red-500/30 text-red-400" : "border-green-500/30 text-green-400")}>
                              {config.label}
                            </Badge>
                          </TableCell>
                          <TableCell className={cn("text-right font-medium", isLiab ? "text-red-500" : "text-green-500")}>
                            {isLiab ? "-" : ""}{fmtLocal(val)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {purchasePrice ? fmtLocal(purchasePrice) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {gain !== null ? (
                              <span className={cn(gain >= 0 ? "text-green-500" : "text-red-500")}>
                                {gain >= 0 ? "+" : ""}{fmtLocal(gain)}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingAsset(a); setAssetDialogOpen(true) }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-400" onClick={() => handleDeleteAsset(a.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Landmark className="h-10 w-10 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Track Your Assets</h2>
                <p className="text-muted-foreground text-center max-w-md mb-6">
                  Add property, vehicles, savings, retirement accounts, and debts to see your complete financial picture on the dashboard.
                </p>
                <Button onClick={() => { setEditingAsset(null); setAssetDialogOpen(true) }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Asset
                </Button>
              </CardContent>
            </Card>
          )}

          <AssetDialog
            open={assetDialogOpen}
            onOpenChange={setAssetDialogOpen}
            asset={editingAsset}
            onSaved={() => { setAssetDialogOpen(false); setEditingAsset(null); fetchData() }}
          />

          {/* Akahu Connect Dialog */}
          <Dialog open={akahuConnectOpen} onOpenChange={setAkahuConnectOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Connect Bank via Akahu</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect your bank accounts via Akahu (NZ open banking) to automatically sync balances.
                  Create a free personal app at{" "}
                  <a href="https://my.akahu.nz/apps" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                    my.akahu.nz
                  </a>
                  , connect your bank, then paste your tokens below.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="App Token (app_token_...)"
                    className="w-full text-sm rounded-md border bg-background px-3 py-2"
                    value={akahuAppToken}
                    onChange={(e) => setAkahuAppToken(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="User Token (user_token_...)"
                    className="w-full text-sm rounded-md border bg-background px-3 py-2"
                    value={akahuUserToken}
                    onChange={(e) => setAkahuUserToken(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAkahuConnect}
                  disabled={connecting || !akahuAppToken.trim() || !akahuUserToken.trim()}
                  className="w-full"
                >
                  {connecting ? "Connecting..." : "Connect & Sync"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

// ── Asset Dialog ──────────────────────────────────────

function AssetDialog({ open, onOpenChange, asset, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; asset: Asset | null; onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState("property")
  const [value, setValue] = useState("")
  const [currency, setCurrency] = useState("NZD")
  const [address, setAddress] = useState("")
  const [purchasePrice, setPurchasePrice] = useState("")
  const [purchaseDate, setPurchaseDate] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (asset) {
      setName(asset.name); setType(asset.type); setValue(String(asset.value))
      setCurrency(asset.currency); setAddress(asset.address ?? "")
      setPurchasePrice(asset.purchase_price ? String(asset.purchase_price) : "")
      setPurchaseDate(asset.purchase_date ?? ""); setNotes(asset.notes ?? "")
    } else {
      setName(""); setType("property"); setValue(""); setCurrency("NZD")
      setAddress(""); setPurchasePrice(""); setPurchaseDate(""); setNotes("")
    }
    setError("")
  }, [asset, open])

  const handleSave = async () => {
    if (!name.trim()) return setError("Name is required")
    if (!value || isNaN(Number(value))) return setError("Valid value is required")
    setSaving(true); setError("")

    const body = {
      ...(asset ? { id: asset.id } : {}),
      name: name.trim(), type, value: Number(value), currency,
      address: address.trim() || null, purchase_price: purchasePrice ? Number(purchasePrice) : null,
      purchase_date: purchaseDate || null, notes: notes.trim() || null,
    }

    const res = await fetch("/api/assets", {
      method: asset ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (res.ok) onSaved()
    else { const data = await res.json(); setError(data.error ?? "Failed to save") }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Asset" : "Add Asset"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ASSET_TYPES.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={cn("flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                      type === t.value
                        ? t.isLiability ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-muted hover:bg-accent text-muted-foreground border border-transparent"
                    )}>
                    <Icon className="h-3.5 w-3.5" />{t.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label htmlFor="asset-name" className="text-sm font-medium">Name</label>
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={type === "property" ? "e.g. 42 Queen Street" : "e.g. Toyota Corolla"} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-value" className="text-sm font-medium">Current Value</label>
              <Input id="asset-value" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="mt-1" />
            </div>
            <div>
              <label htmlFor="asset-currency" className="text-sm font-medium">Currency</label>
              <select id="asset-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="NZD">NZD</option><option value="USD">USD</option><option value="AUD">AUD</option>
                <option value="GBP">GBP</option><option value="EUR">EUR</option>
              </select>
            </div>
          </div>
          {type === "property" && (
            <div>
              <label htmlFor="asset-address" className="text-sm font-medium">Address</label>
              <Input id="asset-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main Street, Auckland" className="mt-1" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-purchase" className="text-sm font-medium">Purchase Price</label>
              <Input id="asset-purchase" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <label htmlFor="asset-date" className="text-sm font-medium">Purchase Date</label>
              <Input id="asset-date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <label htmlFor="asset-notes" className="text-sm font-medium">Notes</label>
            <Input id="asset-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="mt-1" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : asset ? "Update" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

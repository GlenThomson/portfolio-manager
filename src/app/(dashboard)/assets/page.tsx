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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Home,
  Car,
  Wallet,
  Bitcoin,
  PiggyBank,
  Package,
  Building2,
  CreditCard,
  Banknote,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Landmark,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/hooks/useCurrency"

// ── Types ──────────────────────────────────────────────

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

function getTypeConfig(type: string) {
  return ASSET_TYPES.find((t) => t.value === type) ?? ASSET_TYPES[5]
}

function isLiability(type: string) {
  return LIABILITY_TYPES.has(type)
}

// ── Component ──────────────────────────────────────────

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const { fmtHome } = useCurrency()

  const fetchAssets = useCallback(async () => {
    const res = await fetch("/api/assets")
    if (res.ok) setAssets(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  // Calculations
  const assetItems = assets.filter((a) => !isLiability(a.type))
  const liabilityItems = assets.filter((a) => isLiability(a.type))
  const totalAssets = assetItems.reduce((sum, a) => sum + Number(a.value), 0)
  const totalLiabilities = liabilityItems.reduce((sum, a) => sum + Number(a.value), 0)
  const netWorth = totalAssets - totalLiabilities

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/assets?id=${id}`, { method: "DELETE" })
    if (res.ok) setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  const handleEdit = (asset: Asset) => {
    setEditing(asset)
    setDialogOpen(true)
  }

  const handleNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }

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
          <h1 className="text-2xl font-bold tracking-tight">Net Worth</h1>
          <p className="text-muted-foreground">
            Track all your assets and liabilities in one place.
          </p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{fmtHome(totalAssets)}</div>
            <p className="text-xs text-muted-foreground">{assetItems.length} item{assetItems.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{fmtHome(totalLiabilities)}</div>
            <p className="text-xs text-muted-foreground">{liabilityItems.length} item{liabilityItems.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Worth</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", netWorth >= 0 ? "text-green-500" : "text-red-500")}>
              {fmtHome(netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">Assets minus liabilities</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown bar */}
      {totalAssets > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Visual bar */}
              <div className="flex h-6 rounded-full overflow-hidden bg-muted">
                {assetItems.map((a) => {
                  const pct = (Number(a.value) / totalAssets) * 100
                  if (pct < 1) return null
                  const config = getTypeConfig(a.type)
                  const colors: Record<string, string> = {
                    property: "bg-blue-500",
                    vehicle: "bg-cyan-500",
                    cash: "bg-green-500",
                    crypto: "bg-orange-500",
                    kiwisaver: "bg-purple-500",
                    "other-asset": "bg-gray-500",
                  }
                  return (
                    <div
                      key={a.id}
                      className={cn("h-full", colors[a.type] ?? "bg-gray-500")}
                      style={{ width: `${pct}%` }}
                      title={`${a.name}: ${fmtHome(Number(a.value))} (${pct.toFixed(1)}%)`}
                    />
                  )
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3">
                {assetItems.map((a) => {
                  const config = getTypeConfig(a.type)
                  const Icon = config.icon
                  return (
                    <div key={a.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      <span>{a.name}</span>
                      <span className="font-medium text-foreground">{fmtHome(Number(a.value))}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assets table */}
      {assets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Assets & Liabilities</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Purchase Price</TableHead>
                  <TableHead className="text-right">Gain/Loss</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
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
                            {a.address && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{a.address}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", isLiab ? "border-red-500/30 text-red-400" : "border-green-500/30 text-green-400")}>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", isLiab ? "text-red-500" : "text-green-500")}>
                        {isLiab ? "-" : ""}{fmtHome(val)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {purchasePrice ? fmtHome(purchasePrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {gain !== null ? (
                          <span className={cn(gain >= 0 ? "text-green-500" : "text-red-500")}>
                            {gain >= 0 ? "+" : ""}{fmtHome(gain)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(a.updated_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(a)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-400" onClick={() => handleDelete(a.id)}>
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
            <h2 className="text-xl font-semibold mb-2">Track Your Net Worth</h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Add your property, vehicles, savings, retirement accounts, and debts to see your complete financial picture.
            </p>
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Asset
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <AssetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        asset={editing}
        onSaved={() => {
          setDialogOpen(false)
          setEditing(null)
          fetchAssets()
        }}
      />
    </div>
  )
}

// ── Asset Dialog ──────────────────────────────────────

function AssetDialog({
  open,
  onOpenChange,
  asset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  onSaved: () => void
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
      setName(asset.name)
      setType(asset.type)
      setValue(String(asset.value))
      setCurrency(asset.currency)
      setAddress(asset.address ?? "")
      setPurchasePrice(asset.purchase_price ? String(asset.purchase_price) : "")
      setPurchaseDate(asset.purchase_date ?? "")
      setNotes(asset.notes ?? "")
    } else {
      setName("")
      setType("property")
      setValue("")
      setCurrency("NZD")
      setAddress("")
      setPurchasePrice("")
      setPurchaseDate("")
      setNotes("")
    }
    setError("")
  }, [asset, open])

  const handleSave = async () => {
    if (!name.trim()) return setError("Name is required")
    if (!value || isNaN(Number(value))) return setError("Valid value is required")

    setSaving(true)
    setError("")

    const body = {
      ...(asset ? { id: asset.id } : {}),
      name: name.trim(),
      type,
      value: Number(value),
      currency,
      address: address.trim() || null,
      purchase_price: purchasePrice ? Number(purchasePrice) : null,
      purchase_date: purchaseDate || null,
      notes: notes.trim() || null,
    }

    const res = await fetch("/api/assets", {
      method: asset ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json()
      setError(data.error ?? "Failed to save")
    }
  }

  const showAddress = type === "property"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Asset" : "Add Asset"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ASSET_TYPES.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left",
                      type === t.value
                        ? t.isLiability
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "bg-muted hover:bg-accent text-muted-foreground border border-transparent"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="asset-name" className="text-sm font-medium">Name</label>
            <Input
              id="asset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "property" ? "e.g. 42 Queen Street" : "e.g. Toyota Corolla"}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-value" className="text-sm font-medium">
                Current Value
              </label>
              <Input
                id="asset-value"
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="asset-currency" className="text-sm font-medium">Currency</label>
              <select
                id="asset-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="NZD">NZD</option>
                <option value="USD">USD</option>
                <option value="AUD">AUD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {showAddress && (
            <div>
              <label htmlFor="asset-address" className="text-sm font-medium">Address</label>
              <Input
                id="asset-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main Street, Auckland"
                className="mt-1"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-purchase" className="text-sm font-medium">Purchase Price</label>
              <Input
                id="asset-purchase"
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Optional"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="asset-date" className="text-sm font-medium">Purchase Date</label>
              <Input
                id="asset-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label htmlFor="asset-notes" className="text-sm font-medium">Notes</label>
            <Input
              id="asset-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="mt-1"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : asset ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

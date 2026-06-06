"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, RefreshCw, ExternalLink, Target, Settings as SettingsIcon, Sparkles, AlertTriangle, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScanMarket {
  id: string
  market_id: string
  slug: string
  question: string
  category: string | null
  yes_price: string
  no_price: string
  volume_24h: string
  liquidity: string
  end_date: string | null
  market_url: string
  ai_score: string
  ai_confidence: string | null
  ai_thesis: string | null
  ai_suggested_side: string | null
  ai_edge_pct: string | null
  ai_concerns: string | null
}

interface Settings {
  wallet_address: string | null
  scan_enabled: boolean
  min_volume_usd: string
  min_liquidity_usd: string
  min_position_usd: string
  max_end_date_days: string
  min_end_date_days: string
  max_spread_cents: string
  excluded_categories: string[]
  min_ai_score: string
}

const DEFAULT_SETTINGS: Settings = {
  wallet_address: null,
  scan_enabled: true,
  min_volume_usd: "5000",
  min_liquidity_usd: "1000",
  min_position_usd: "100",
  max_end_date_days: "365",
  min_end_date_days: "5",
  max_spread_cents: "0.04",
  excluded_categories: ["Sports"],
  min_ai_score: "60",
}

function fmtMoney(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((Date.parse(iso) - Date.now()) / 86400_000)
}

function scoreColor(score: number): string {
  if (score >= 75) return "#26a69a"
  if (score >= 60) return "#ffab00"
  if (score >= 40) return "#ff9500"
  return "#787b86"
}

export default function PolymarketPage() {
  const [tab, setTab] = useState<"picks" | "settings">("picks")
  const [markets, setMarkets] = useState<ScanMarket[]>([])
  const [scanDate, setScanDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const fetchMarkets = useCallback(async (all = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/polymarket/markets${all ? "?all=true" : ""}`)
      if (res.ok) {
        const data = await res.json()
        setMarkets(data.markets ?? [])
        setScanDate(data.scanDate)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/polymarket/settings")
      if (res.ok) {
        const data = await res.json()
        if (data) setSettings({ ...DEFAULT_SETTINGS, ...data })
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchMarkets(showAll)
    fetchSettings()
  }, [fetchMarkets, fetchSettings, showAll])

  const runScan = async () => {
    setScanning(true)
    setScanMessage(null)
    try {
      const res = await fetch("/api/polymarket/scan", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setScanMessage(data.error ?? "Scan failed")
        return
      }
      setScanMessage(`Scanned ${data.marketsFetched}, ${data.marketsAfterFilter} passed filters, ${data.topMatches} above your AI score threshold.`)
      await fetchMarkets(showAll)
    } catch (err) {
      setScanMessage(err instanceof Error ? err.message : "Scan failed")
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            Polymarket
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI scans Polymarket daily for opportunities matching your rules. Click through to bet on polymarket.com.
          </p>
        </div>
        <Button onClick={runScan} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Run scan now
        </Button>
      </div>

      {scanMessage && (
        <div className="text-xs text-muted-foreground">{scanMessage}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 rounded-md p-1" style={{ background: "#131722" }}>
        {(["picks", "settings"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2",
              tab === k ? "bg-[#2a2e39] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]"
            )}
          >
            {k === "picks" ? <Sparkles className="h-3.5 w-3.5" /> : <SettingsIcon className="h-3.5 w-3.5" />}
            {k === "picks" ? "Today's Picks" : "Settings"}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "picks" ? (
        <PicksTab
          markets={markets}
          scanDate={scanDate}
          loading={loading}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((v) => !v)}
        />
      ) : (
        <SettingsTab settings={settings} onSaved={fetchSettings} />
      )}
    </div>
  )
}

// ── Picks tab ────────────────────────────────────────────

function PicksTab({
  markets, scanDate, loading, showAll, onToggleShowAll,
}: {
  markets: ScanMarket[]
  scanDate: string | null
  loading: boolean
  showAll: boolean
  onToggleShowAll: () => void
}) {
  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} /></div>
  }
  if (markets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Sparkles className="h-10 w-10 mx-auto mb-3" style={{ color: "#787b86" }} />
          <h3 className="font-medium mb-1">No matches today</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {scanDate ? `Last scan: ${scanDate}. ` : "No scans yet. "}
            Try lowering your min AI score in Settings, or click <strong>Run scan now</strong> if no scan has run.
          </p>
          <Button variant="outline" size="sm" onClick={onToggleShowAll}>
            {showAll ? "Show only matches" : "Show all scanned markets"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Scan from {scanDate} · {markets.length} {showAll ? "scanned" : "matching your threshold"}</span>
        <button onClick={onToggleShowAll} className="text-primary hover:underline">
          {showAll ? "Show only matches" : "Show all scanned"}
        </button>
      </div>
      {markets.map((m) => <MarketCard key={m.id} market={m} />)}
    </div>
  )
}

function MarketCard({ market }: { market: ScanMarket }) {
  const yesPct = Math.round(Number(market.yes_price) * 100)
  const score = Number(market.ai_score)
  const color = scoreColor(score)
  const days = daysUntil(market.end_date)
  const edge = market.ai_edge_pct != null ? Number(market.ai_edge_pct) : null
  const side = market.ai_suggested_side

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
              {market.category && <span className="px-1.5 py-0.5 rounded bg-muted">{market.category}</span>}
              {days != null && <span>{days}d to resolution</span>}
              <span>Vol {fmtMoney(Number(market.volume_24h))} (24h)</span>
              <span>Liquidity {fmtMoney(Number(market.liquidity))}</span>
            </div>
            <h3 className="font-semibold text-sm">{market.question}</h3>
            {market.ai_thesis && (
              <p className="text-xs text-muted-foreground mt-2">{market.ai_thesis}</p>
            )}
            {market.ai_concerns && (
              <p className="text-[11px] mt-1 flex items-start gap-1" style={{ color: "#ffab00" }}>
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                {market.ai_concerns}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI Score</div>
            <div className="text-3xl font-bold leading-none" style={{ color }}>{score}</div>
            {market.ai_confidence && (
              <div className="text-[10px] text-muted-foreground mt-1">conf {Math.round(Number(market.ai_confidence))}%</div>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">YES priced at</div>
            <div className="text-lg font-bold">{yesPct}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">AI suggests</div>
            <div className="text-lg font-bold" style={{ color: side === "yes" ? "#26a69a" : side === "no" ? "#ef5350" : "#787b86" }}>
              {side ? side.toUpperCase() : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Edge (pp)</div>
            <div className="text-lg font-bold" style={{ color: edge != null && edge > 0 ? "#26a69a" : edge != null && edge < 0 ? "#ef5350" : "#787b86" }}>
              {edge != null ? `${edge >= 0 ? "+" : ""}${edge.toFixed(0)}` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <a
            href={market.market_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded text-white"
            style={{ background: color }}
          >
            Open on Polymarket <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Settings tab ─────────────────────────────────────────

function SettingsTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [form, setForm] = useState<Settings>(settings)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState("")

  useEffect(() => { setForm(settings) }, [settings])

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/polymarket/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMessage(j.error ?? "Save failed")
        return
      }
      setMessage("Saved")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const addExcluded = () => {
    const v = newCategory.trim()
    if (!v) return
    if (!form.excluded_categories.includes(v)) {
      setForm({ ...form, excluded_categories: [...form.excluded_categories, v] })
    }
    setNewCategory("")
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
            Polymarket wallet address (optional)
          </label>
          <input
            value={form.wallet_address ?? ""}
            onChange={(e) => setForm({ ...form, wallet_address: e.target.value || null })}
            placeholder="0x..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Public address. Used to pull your existing positions (Phase 2). Safe to share — never your private key.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumberField label="Min 24h volume (USD)" value={form.min_volume_usd} onChange={(v) => setForm({ ...form, min_volume_usd: v })} hint="Skip markets too quiet to trade" />
          <NumberField label="Min liquidity (USD)" value={form.min_liquidity_usd} onChange={(v) => setForm({ ...form, min_liquidity_usd: v })} hint="Order book depth" />
          <NumberField label="Your typical position size (USD)" value={form.min_position_usd} onChange={(v) => setForm({ ...form, min_position_usd: v })} hint="Filters out markets too thin for this size" />
          <NumberField label="Max spread (¢)" value={form.max_spread_cents} onChange={(v) => setForm({ ...form, max_spread_cents: v })} hint="Skip wide bid-ask spreads" />
          <NumberField label="Min days to resolution" value={form.min_end_date_days} onChange={(v) => setForm({ ...form, min_end_date_days: v })} hint="Avoid noisy last-minute markets" />
          <NumberField label="Max days to resolution" value={form.max_end_date_days} onChange={(v) => setForm({ ...form, max_end_date_days: v })} hint="Avoid locking capital long-term" />
          <NumberField label="Min AI score to show" value={form.min_ai_score} onChange={(v) => setForm({ ...form, min_ai_score: v })} hint="0-100, higher = stricter" />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
            Excluded categories
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {form.excluded_categories.map((c) => (
              <span key={c} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/15 text-red-500 border border-red-500/30">
                {c}
                <button onClick={() => setForm({ ...form, excluded_categories: form.excluded_categories.filter((x) => x !== c) })} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExcluded() } }}
              placeholder="e.g. Sports, Entertainment, Music"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
            />
            <Button size="sm" variant="outline" onClick={addExcluded}>Add</Button>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">{message}</span>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function NumberField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

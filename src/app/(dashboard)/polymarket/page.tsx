"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, RefreshCw, ExternalLink, Target, Settings as SettingsIcon, Sparkles, AlertTriangle, X, Wallet, BarChart3, Plus, Trash2, Edit3, Check } from "lucide-react"
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

type TabKey = "picks" | "bets" | "stats" | "settings"

export default function PolymarketPage() {
  const [tab, setTab] = useState<TabKey>("picks")
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
      <div className="flex gap-0.5 rounded-md p-1 flex-wrap" style={{ background: "#131722" }}>
        {([
          { k: "picks" as const, label: "Today's Picks", icon: <Sparkles className="h-3.5 w-3.5" /> },
          { k: "bets" as const, label: "My Bets", icon: <Wallet className="h-3.5 w-3.5" /> },
          { k: "stats" as const, label: "Stats", icon: <BarChart3 className="h-3.5 w-3.5" /> },
          { k: "settings" as const, label: "Settings", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
        ]).map(({ k, label, icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded transition-colors flex items-center gap-2",
              tab === k ? "bg-[#2a2e39] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "picks" && (
        <PicksTab
          markets={markets}
          scanDate={scanDate}
          loading={loading}
          showAll={showAll}
          onToggleShowAll={() => setShowAll((v) => !v)}
        />
      )}
      {tab === "bets" && <MyBetsTab walletConfigured={!!settings.wallet_address} />}
      {tab === "stats" && <StatsTab />}
      {tab === "settings" && <SettingsTab settings={settings} onSaved={fetchSettings} />}
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

// ── My Bets tab ──────────────────────────────────────────

interface BetRow {
  id: string
  market_id: string
  question: string | null
  category: string | null
  side: string
  shares: string
  avg_price_usd: string
  current_price_usd: string | null
  exit_price: string | null
  exited_at: string | null
  entered_at: string
  pnl_usd: string | null
  source: string
  thesis: string | null
  notes: string | null
  resolved: boolean
  resolution_outcome: string | null
}

function MyBetsTab({ walletConfigured }: { walletConfigured: boolean }) {
  const [bets, setBets] = useState<BetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open")
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchBets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/polymarket/bets?filter=${filter}`)
      if (res.ok) setBets(await res.json())
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchBets() }, [fetchBets])

  const syncWallet = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch("/api/polymarket/sync-wallet", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setSyncMessage(data.error ?? "Sync failed")
        return
      }
      setSyncMessage(`Fetched ${data.positionsFetched ?? 0} from wallet · ${data.inserted ?? 0} new, ${data.updated ?? 0} updated, ${data.exited ?? 0} exited.`)
      await fetchBets()
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  const deleteBet = async (id: string) => {
    const res = await fetch(`/api/polymarket/bets?id=${id}`, { method: "DELETE" })
    if (res.ok) await fetchBets()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-0.5 rounded-md p-1" style={{ background: "#131722" }}>
          {(["open", "closed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded transition-colors capitalize",
                filter === f ? "bg-[#2a2e39] text-[#d1d4dc]" : "text-[#787b86] hover:text-[#d1d4dc]"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add bet
          </Button>
          <Button size="sm" onClick={syncWallet} disabled={syncing || !walletConfigured} title={!walletConfigured ? "Add your wallet address in Settings first" : undefined}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wallet className="h-3.5 w-3.5 mr-1" />}
            Sync wallet
          </Button>
        </div>
      </div>

      {syncMessage && <div className="text-xs text-muted-foreground">{syncMessage}</div>}
      {!walletConfigured && (
        <div className="text-xs flex items-start gap-1.5" style={{ color: "#ffab00" }}>
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Add your Polymarket wallet address in Settings to auto-sync your positions.
        </div>
      )}

      {showAdd && <AddBetForm onSaved={() => { setShowAdd(false); fetchBets() }} onCancel={() => setShowAdd(false)} />}

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} /></div>
      ) : bets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="h-10 w-10 mx-auto mb-3" style={{ color: "#787b86" }} />
            <h3 className="font-medium mb-1">No {filter === "all" ? "" : filter} bets</h3>
            <p className="text-sm text-muted-foreground">
              {walletConfigured ? "Click Sync wallet to pull positions, or Add bet to log one manually." : "Add a bet manually, or set your wallet in Settings to auto-sync."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {bets.map((b) => (
            <BetCard
              key={b.id}
              bet={b}
              editing={editingId === b.id}
              onEdit={() => setEditingId(b.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); fetchBets() }}
              onDelete={() => deleteBet(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BetCard({ bet, editing, onEdit, onCancelEdit, onSaved, onDelete }: {
  bet: BetRow
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onDelete: () => void
}) {
  const [thesis, setThesis] = useState(bet.thesis ?? "")
  const [notes, setNotes] = useState(bet.notes ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) { setThesis(bet.thesis ?? ""); setNotes(bet.notes ?? "") }
  }, [editing, bet.thesis, bet.notes])

  const shares = Number(bet.shares)
  const avg = Number(bet.avg_price_usd)
  const current = Number(bet.current_price_usd ?? bet.exit_price ?? bet.avg_price_usd)
  const staked = shares * avg
  const value = shares * current
  const pnl = bet.pnl_usd != null ? Number(bet.pnl_usd) : value - staked
  const pnlPct = staked > 0 ? (pnl / staked) * 100 : 0
  const isOpen = !bet.exited_at
  const sideColor = bet.side === "yes" ? "#26a69a" : "#ef5350"

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/polymarket/bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bet.id, thesis, notes }),
      })
      if (res.ok) onSaved()
    } finally {
      setSaving(false)
    }
  }

  const closeBet = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/polymarket/bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bet.id,
          exited_at: new Date().toISOString(),
          exit_price: current,
          pnl_usd: pnl,
        }),
      })
      if (res.ok) onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1 flex-wrap">
              <span className="font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${sideColor}22`, color: sideColor }}>
                {bet.side}
              </span>
              {bet.category && <span className="px-1.5 py-0.5 rounded bg-muted">{bet.category}</span>}
              <span>{bet.source === "wallet_sync" ? "from wallet" : "manual"}</span>
              <span>entered {new Date(bet.entered_at).toLocaleDateString()}</span>
              {!isOpen && <span>exited {new Date(bet.exited_at!).toLocaleDateString()}</span>}
            </div>
            <h4 className="font-medium text-sm">{bet.question ?? bet.market_id}</h4>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase text-muted-foreground">{isOpen ? "Unrealized" : "Realized"}</div>
            <div className="text-base font-bold" style={{ color: pnl >= 0 ? "#26a69a" : "#ef5350" }}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
            </div>
            <div className="text-[10px]" style={{ color: pnl >= 0 ? "#26a69a" : "#ef5350" }}>
              {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px]">
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">Shares</div>
            <div className="font-medium">{shares.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">Avg ¢</div>
            <div className="font-medium">{(avg * 100).toFixed(1)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">{isOpen ? "Now ¢" : "Exit ¢"}</div>
            <div className="font-medium">{(current * 100).toFixed(1)}</div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">Value</div>
            <div className="font-medium">${value.toFixed(2)}</div>
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Thesis — why you took this bet"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              rows={2}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes — updates, news, exit reasoning"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={onCancelEdit}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {(bet.thesis || bet.notes) && (
              <div className="mt-2 space-y-1 text-[11px]">
                {bet.thesis && <div><span className="text-muted-foreground">Thesis:</span> {bet.thesis}</div>}
                {bet.notes && <div><span className="text-muted-foreground">Notes:</span> {bet.notes}</div>}
              </div>
            )}
            <div className="mt-2 flex gap-1 justify-end">
              <a
                href={`https://polymarket.com/event/${bet.market_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline px-2 py-1"
              >
                Open <ExternalLink className="h-3 w-3" />
              </a>
              <button onClick={onEdit} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-2 py-1">
                <Edit3 className="h-3 w-3" /> Edit
              </button>
              {isOpen && (
                <button onClick={closeBet} disabled={saving} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-2 py-1">
                  <Check className="h-3 w-3" /> Mark closed
                </button>
              )}
              <button onClick={onDelete} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 px-2 py-1">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function AddBetForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [marketId, setMarketId] = useState("")
  const [question, setQuestion] = useState("")
  const [category, setCategory] = useState("")
  const [side, setSide] = useState<"yes" | "no">("yes")
  const [shares, setShares] = useState("")
  const [avgPrice, setAvgPrice] = useState("")
  const [thesis, setThesis] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!marketId.trim() || !shares || !avgPrice) {
      setError("Market slug, shares, and avg price are required")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/polymarket/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market_id: marketId.trim(),
          question: question.trim() || null,
          category: category.trim() || null,
          side,
          shares: Number(shares),
          avg_price_usd: Number(avgPrice),
          thesis: thesis.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Save failed"); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="font-medium text-sm">Add bet manually</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Market slug or ID *</label>
            <input
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              placeholder="e.g. will-bitcoin-reach-200k-in-2026"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Crypto, Politics, etc."
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Question</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What does the market ask?"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Side *</label>
            <div className="flex gap-1">
              {(["yes", "no"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "flex-1 py-1.5 text-xs font-medium rounded uppercase transition-colors",
                    side === s
                      ? s === "yes" ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" : "bg-red-500/20 text-red-500 border border-red-500/30"
                      : "bg-muted text-muted-foreground border border-transparent"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Shares *</label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="e.g. 100"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Avg price (USD per share, 0-1) *</label>
            <input
              type="number"
              step="0.01"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
              placeholder="e.g. 0.42"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">Thesis</label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Why are you taking this bet?"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              rows={2}
            />
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Save bet
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Stats tab ────────────────────────────────────────────

interface OverallStats {
  totalBets: number
  openBets: number
  closedBets: number
  wins: number
  losses: number
  winRate: number
  openValue: number
  openCost: number
  openPnl: number
  realizedPnl: number
  realizedStaked: number
  realizedRoi: number
  totalPnl: number
}

interface CategoryStatsRow {
  category: string
  betCount: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  totalStaked: number
  roi: number
}

function StatsTab() {
  const [stats, setStats] = useState<{ overall: OverallStats; byCategory: CategoryStatsRow[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/polymarket/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} /></div>
  }
  if (!stats || stats.overall.totalBets === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto mb-3" style={{ color: "#787b86" }} />
          <h3 className="font-medium mb-1">No bets to analyse yet</h3>
          <p className="text-sm text-muted-foreground">Sync your wallet or add a bet manually to see stats roll in.</p>
        </CardContent>
      </Card>
    )
  }

  const { overall, byCategory } = stats

  return (
    <div className="space-y-4">
      {/* Headline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total P&L" value={`${overall.totalPnl >= 0 ? "+" : ""}$${overall.totalPnl.toFixed(2)}`} color={overall.totalPnl >= 0 ? "#26a69a" : "#ef5350"} />
        <StatCard label="Win rate" value={`${(overall.winRate * 100).toFixed(0)}%`} sub={`${overall.wins}W / ${overall.losses}L`} />
        <StatCard label="Open P&L" value={`${overall.openPnl >= 0 ? "+" : ""}$${overall.openPnl.toFixed(2)}`} sub={`${overall.openBets} open`} color={overall.openPnl >= 0 ? "#26a69a" : "#ef5350"} />
        <StatCard label="Realized ROI" value={`${(overall.realizedRoi * 100).toFixed(1)}%`} sub={`$${overall.realizedStaked.toFixed(0)} staked`} color={overall.realizedRoi >= 0 ? "#26a69a" : "#ef5350"} />
      </div>

      {/* Category breakdown */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium text-sm mb-3">By category</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-medium pb-2">Category</th>
                  <th className="text-right font-medium pb-2">Bets</th>
                  <th className="text-right font-medium pb-2">Win rate</th>
                  <th className="text-right font-medium pb-2">Staked</th>
                  <th className="text-right font-medium pb-2">P&L</th>
                  <th className="text-right font-medium pb-2">ROI</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((row) => (
                  <tr key={row.category} className="border-b border-border/40">
                    <td className="py-2 font-medium">{row.category}</td>
                    <td className="text-right py-2">{row.betCount}</td>
                    <td className="text-right py-2">{(row.wins + row.losses) > 0 ? `${(row.winRate * 100).toFixed(0)}%` : "—"}</td>
                    <td className="text-right py-2">${row.totalStaked.toFixed(0)}</td>
                    <td className="text-right py-2 font-medium" style={{ color: row.totalPnl >= 0 ? "#26a69a" : "#ef5350" }}>
                      {row.totalPnl >= 0 ? "+" : ""}${row.totalPnl.toFixed(2)}
                    </td>
                    <td className="text-right py-2 font-medium" style={{ color: row.roi >= 0 ? "#26a69a" : "#ef5350" }}>
                      {row.totalStaked > 0 ? `${row.roi >= 0 ? "+" : ""}${(row.roi * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-bold mt-1" style={color ? { color } : undefined}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

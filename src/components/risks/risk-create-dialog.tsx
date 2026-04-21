"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Sparkles, X } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}

const PROVIDERS = [
  { key: "news", label: "News sentiment", description: "AI scans recent headlines and scores severity." },
  { key: "market", label: "Market signals", description: "Tracks volatility and drawdowns in linked tickers." },
  { key: "polymarket", label: "Prediction markets", description: "Aggregates implied probabilities from Polymarket." },
  { key: "taiwan_incursions", label: "PLA ADIZ incursions", description: "Extracts PLA aircraft/vessel counts from Taiwan news (Taiwan-specific)." },
] as const

export function RiskCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [keywords, setKeywords] = useState<string[]>([])
  const [linkedTickers, setLinkedTickers] = useState<string[]>([])
  const [hedgeTickers, setHedgeTickers] = useState<string[]>([])
  const [providers, setProviders] = useState<string[]>(["news"])
  const [alertOnLevel, setAlertOnLevel] = useState<string>("")
  const [alertOnChange, setAlertOnChange] = useState<string>("")
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle("")
    setDescription("")
    setKeywords([])
    setLinkedTickers([])
    setHedgeTickers([])
    setProviders(["news"])
    setAlertOnLevel("")
    setAlertOnChange("")
    setError(null)
  }

  const suggestKeywords = async () => {
    if (!title.trim()) return
    setSuggesting(true)
    setError(null)
    try {
      const res = await fetch("/api/risks/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? "Suggest failed")
        return
      }
      const data = await res.json()
      setKeywords(data.keywords ?? [])
      setLinkedTickers(data.suggestedTickers ?? [])
      setHedgeTickers(data.suggestedHedgeTickers ?? [])
      if (Array.isArray(data.suggestedProviders) && data.suggestedProviders.length > 0) {
        setProviders(data.suggestedProviders)
      }
    } finally {
      setSuggesting(false)
    }
  }

  const toggleProvider = (key: string) => {
    if (key === "news") return // always on
    setProviders((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])
  }

  const save = async () => {
    if (!title.trim()) {
      setError("Title is required")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const createRes = await fetch("/api/risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          keywords,
          linked_tickers: linkedTickers,
          hedge_tickers: hedgeTickers,
          providers,
          alert_on_level: alertOnLevel ? parseInt(alertOnLevel) : null,
          alert_on_change: alertOnChange ? parseInt(alertOnChange) : null,
        }),
      })
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}))
        setError(j.error ?? "Save failed")
        return
      }
      const created = await createRes.json()

      // Compute first score immediately (fire and forget — UI will refresh)
      fetch(`/api/risks/${created.id}/compute`, { method: "POST" }).catch(() => {})

      reset()
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const removeKeyword = (k: string) => setKeywords((prev) => prev.filter((x) => x !== k))
  const removeTicker = (t: string) => setLinkedTickers((prev) => prev.filter((x) => x !== t))
  const removeHedge = (t: string) => setHedgeTickers((prev) => prev.filter((x) => x !== t))

  const addKeyword = (input: string) => {
    const v = input.trim()
    if (v && !keywords.includes(v)) setKeywords([...keywords, v])
  }
  const addTicker = (input: string) => {
    const v = input.trim().toUpperCase()
    if (v && !linkedTickers.includes(v)) setLinkedTickers([...linkedTickers, v])
  }
  const addHedge = (input: string) => {
    const v = input.trim().toUpperCase()
    if (v && !hedgeTickers.includes(v)) setHedgeTickers([...hedgeTickers, v])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create risk monitor</DialogTitle>
          <DialogDescription>
            Describe any downside risk in plain English. AI scans news daily and produces a 0-100 score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Taiwan invasion risk"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Description (optional, helps AI)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What exactly are you worried about? e.g. Concerned about semiconductor supply disruption and TSMC exposure."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={suggestKeywords}
              disabled={!title.trim() || suggesting}
            >
              {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              AI suggest keywords
            </Button>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Search keywords (news queries)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
              {keywords.map((k) => (
                <span key={k} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted">
                  {k}
                  <button onClick={() => removeKeyword(k)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Use AI suggest, or add your own</span>
              )}
            </div>
            <KeywordInput placeholder="Add a keyword + enter..." onAdd={addKeyword} />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Linked tickers (feed market-signal scoring)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
              {linkedTickers.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted">
                  {t}
                  <button onClick={() => removeTicker(t)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {linkedTickers.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Optional</span>
              )}
            </div>
            <KeywordInput placeholder="Add a ticker (e.g. TSM) + enter..." onAdd={addTicker} />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
              Hedge candidates (entry-signal monitoring)
            </label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Tickers worth buying puts/protection on when this risk is elevated. System tracks RSI, drawdown, and 52w-high distance — alerts when entry conditions align with risk being elevated.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
              {hedgeTickers.map((t) => (
                <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  {t}
                  <button onClick={() => removeHedge(t)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {hedgeTickers.length === 0 && (
                <span className="text-xs text-muted-foreground italic">Optional</span>
              )}
            </div>
            <KeywordInput placeholder="Add a hedge ticker + enter..." onAdd={addHedge} />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-2">
              Data providers
            </label>
            <div className="space-y-2">
              {PROVIDERS.map((p) => {
                const checked = providers.includes(p.key)
                const locked = p.key === "news"
                return (
                  <label
                    key={p.key}
                    className={`flex items-start gap-3 p-2 rounded border cursor-pointer transition-colors ${
                      checked ? "bg-primary/5 border-primary/30" : "border-border hover:bg-muted/30"
                    } ${locked ? "opacity-80 cursor-default" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleProvider(p.key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{p.label} {locked && <span className="text-[10px] text-muted-foreground font-normal ml-1">(always on)</span>}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                Alert if score ≥
              </label>
              <input
                type="number" min="0" max="100"
                value={alertOnLevel}
                onChange={(e) => setAlertOnLevel(e.target.value)}
                placeholder="e.g. 60"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground block mb-1">
                Alert if daily change ≥
              </label>
              <input
                type="number" min="0" max="100"
                value={alertOnChange}
                onChange={(e) => setAlertOnChange(e.target.value)}
                placeholder="e.g. 15"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
            <Button onClick={save} disabled={saving || !title.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Create & compute
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KeywordInput({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("")
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && v.trim()) {
          e.preventDefault()
          onAdd(v)
          setV("")
        }
      }}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
    />
  )
}

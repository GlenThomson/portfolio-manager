"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, Save, Trash2, Pencil, Target, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

interface PositionPlan {
  id?: string
  symbol: string
  state: "drafted" | "active" | "needs_attention" | "closed" | "invalidated"
  entry_thesis: string | null
  target_price: number | null
  target_event: string | null
  target_date: string | null
  stop_price: number | null
  stop_condition: string | null
  review_frequency: "weekly" | "monthly" | "on_earnings" | "on_event"
  review_next_date: string | null
  notes: string | null
  updated_at?: string
}

const EMPTY_PLAN = (symbol: string): PositionPlan => ({
  symbol,
  state: "drafted",
  entry_thesis: "",
  target_price: null,
  target_event: null,
  target_date: null,
  stop_price: null,
  stop_condition: null,
  review_frequency: "monthly",
  review_next_date: null,
  notes: null,
})

const BG = "#131722"
const BORDER = "#2a2e39"
const TEXT_DIM = "#787b86"
const TEXT = "#d1d4dc"

interface PositionPlanProps {
  symbol: string
  currentPrice?: number
  onChange?: () => void
}

export function PositionPlan({ symbol, currentPrice, onChange }: PositionPlanProps) {
  const [plan, setPlan] = useState<PositionPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<PositionPlan>(EMPTY_PLAN(symbol))

  const searchParams = useSearchParams()

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/plans?symbol=${symbol}`)
      if (!res.ok) {
        setPlan(null)
        return
      }
      const data = await res.json()
      const first = Array.isArray(data) ? data[0] : null
      setPlan(first ?? null)
      if (first) setForm(first)
    } catch {
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [symbol])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  // Deep link: ?openPlan=1 opens the editor immediately (from inbox nudge)
  useEffect(() => {
    if (searchParams.get("openPlan") === "1" && !editing) {
      setEditing(true)
      if (!plan) setForm(EMPTY_PLAN(symbol))
    }
    // only react to search params on first render after data load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const draftFromAI = async () => {
    setDrafting(true)
    setMessage(null)
    try {
      const res = await fetch("/api/plans/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMessage(j.error ?? "AI draft failed")
        return
      }
      const { draft } = await res.json()
      setForm((f) => ({
        ...f,
        entry_thesis: draft.entry_thesis ?? f.entry_thesis,
        target_price: draft.target_price ?? f.target_price,
        target_event: draft.target_event ?? f.target_event,
        stop_price: draft.stop_price ?? f.stop_price,
        stop_condition: draft.stop_condition ?? f.stop_condition,
        review_frequency: draft.review_frequency ?? f.review_frequency,
      }))
      setEditing(true)
      setMessage(`AI draft ready — edit below and save.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "AI draft failed")
    } finally {
      setDrafting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const body = {
        symbol,
        state: form.state ?? "active",
        entry_thesis: form.entry_thesis,
        target_price: form.target_price,
        target_event: form.target_event,
        target_date: form.target_date,
        stop_price: form.stop_price,
        stop_condition: form.stop_condition,
        review_frequency: form.review_frequency,
        review_next_date: form.review_next_date,
        notes: form.notes,
      }
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setMessage(j.error ?? "Save failed")
        return
      }
      const data = await res.json()
      setPlan(data)
      setForm(data)
      setEditing(false)
      setMessage("Plan saved")
      onChange?.()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!plan?.id) return
    if (!confirm("Delete this plan?")) return
    try {
      await fetch(`/api/plans?id=${plan.id}`, { method: "DELETE" })
      setPlan(null)
      setForm(EMPTY_PLAN(symbol))
      setEditing(false)
      onChange?.()
    } catch {
      setMessage("Delete failed")
    }
  }

  if (loading) {
    return (
      <div className="rounded-md p-4 flex items-center justify-center" style={{ background: BG, border: `1px solid ${BORDER}`, height: 80 }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: TEXT_DIM }} />
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────
  if (!plan && !editing) {
    return (
      <div className="rounded-md p-4" style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: TEXT_DIM }}>
              Position Plan
            </div>
            <div className="text-sm" style={{ color: TEXT }}>
              No plan yet for {symbol}. Add a thesis, target, and stop so the daily digest can monitor it.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={draftFromAI} disabled={drafting}>
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              AI Draft
            </Button>
            <Button size="sm" onClick={() => { setForm(EMPTY_PLAN(symbol)); setEditing(true) }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Create plan
            </Button>
          </div>
        </div>
        {message && <div className="text-xs mt-2" style={{ color: TEXT_DIM }}>{message}</div>}
      </div>
    )
  }

  // ── Editor ─────────────────────────────────────────────
  if (editing) {
    return (
      <div className="rounded-md p-4 space-y-3" style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>
            {plan ? "Edit plan" : "New plan"} — {symbol}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={draftFromAI} disabled={drafting}>
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              AI Draft
            </Button>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>Entry thesis</label>
          <textarea
            value={form.entry_thesis ?? ""}
            onChange={(e) => setForm({ ...form, entry_thesis: e.target.value })}
            placeholder="Why are you holding this? 1-2 sentences."
            rows={2}
            className="w-full rounded p-2 text-sm"
            style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>
              <Target className="h-3 w-3 inline mr-1" /> Target price
            </label>
            <input
              type="number" step="0.01"
              value={form.target_price ?? ""}
              onChange={(e) => setForm({ ...form, target_price: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder={currentPrice ? `e.g. ${(currentPrice * 1.25).toFixed(0)}` : "USD"}
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>
              <AlertTriangle className="h-3 w-3 inline mr-1" /> Stop price
            </label>
            <input
              type="number" step="0.01"
              value={form.stop_price ?? ""}
              onChange={(e) => setForm({ ...form, stop_price: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder={currentPrice ? `e.g. ${(currentPrice * 0.80).toFixed(0)}` : "USD"}
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>Target event / catalyst</label>
            <input
              value={form.target_event ?? ""}
              onChange={(e) => setForm({ ...form, target_event: e.target.value || null })}
              placeholder="e.g. Q4 earnings beat"
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>Stop condition (thesis break)</label>
            <input
              value={form.stop_condition ?? ""}
              onChange={(e) => setForm({ ...form, stop_condition: e.target.value || null })}
              placeholder="e.g. DC revenue growth < 25% YoY"
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>Review frequency</label>
            <select
              value={form.review_frequency}
              onChange={(e) => setForm({ ...form, review_frequency: e.target.value as PositionPlan["review_frequency"] })}
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="on_earnings">On earnings</option>
              <option value="on_event">On event</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: TEXT_DIM }}>Next review date</label>
            <input
              type="date"
              value={form.review_next_date ?? ""}
              onChange={(e) => setForm({ ...form, review_next_date: e.target.value || null })}
              className="w-full rounded p-2 text-sm"
              style={{ background: "#1e222d", border: `1px solid ${BORDER}`, color: TEXT }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="text-xs" style={{ color: TEXT_DIM }}>{message}</div>
          <div className="flex gap-2">
            {plan && <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(plan) }}>Cancel</Button>}
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save plan
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── View ───────────────────────────────────────────────
  const near = (level: number | null) => {
    if (!level || !currentPrice) return null
    const diff = ((currentPrice - level) / level) * 100
    return diff
  }
  const targetDiff = near(plan!.target_price)
  const stopDiff = near(plan!.stop_price)

  const stateColor =
    plan!.state === "needs_attention" ? "#ff9500" :
    plan!.state === "invalidated" ? "#ef5350" :
    plan!.state === "active" ? "#26a69a" : TEXT_DIM

  return (
    <div className="rounded-md p-4 space-y-3" style={{ background: BG, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>Position Plan</div>
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded" style={{ background: stateColor + "20", color: stateColor }}>
            {plan!.state.replace("_", " ")}
          </span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" style={{ color: TEXT_DIM }} />
          </Button>
        </div>
      </div>

      {plan!.entry_thesis && (
        <p className="text-sm" style={{ color: TEXT }}>{plan!.entry_thesis}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {plan!.target_price != null && (
          <div>
            <div className="uppercase tracking-wider text-[10px]" style={{ color: TEXT_DIM }}>Target</div>
            <div style={{ color: TEXT }}>
              ${plan!.target_price.toFixed(2)}
              {targetDiff != null && (
                <span className={cn("ml-2", targetDiff >= -5 && targetDiff <= 0 ? "text-[#ffab00]" : targetDiff > 0 ? "text-[#26a69a]" : "")} style={{ color: targetDiff < -5 ? TEXT_DIM : undefined }}>
                  {targetDiff >= 0 ? "+" : ""}{targetDiff.toFixed(1)}%
                </span>
              )}
              {plan!.target_event && <span className="ml-2" style={{ color: TEXT_DIM }}>· {plan!.target_event}</span>}
            </div>
          </div>
        )}
        {plan!.stop_price != null && (
          <div>
            <div className="uppercase tracking-wider text-[10px]" style={{ color: TEXT_DIM }}>Stop</div>
            <div style={{ color: TEXT }}>
              ${plan!.stop_price.toFixed(2)}
              {stopDiff != null && (
                <span className={cn("ml-2", stopDiff >= 0 && stopDiff <= 5 ? "text-[#ff9500]" : stopDiff < 0 ? "text-[#ef5350]" : "")} style={{ color: stopDiff > 5 ? TEXT_DIM : undefined }}>
                  {stopDiff >= 0 ? "+" : ""}{stopDiff.toFixed(1)}%
                </span>
              )}
              {plan!.stop_condition && <span className="ml-2" style={{ color: TEXT_DIM }}>· {plan!.stop_condition}</span>}
            </div>
          </div>
        )}
        <div>
          <div className="uppercase tracking-wider text-[10px]" style={{ color: TEXT_DIM }}>Review</div>
          <div style={{ color: TEXT }}>
            {plan!.review_frequency.replace("_", " ")}
            {plan!.review_next_date && <span className="ml-2" style={{ color: TEXT_DIM }}>next: {plan!.review_next_date}</span>}
          </div>
        </div>
      </div>

      {message && <div className="text-xs" style={{ color: TEXT_DIM }}>{message}</div>}
    </div>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TickerSearch } from "@/components/ui/ticker-search"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"

const CONDITION_OPTIONS = [
  { value: "above", label: "Price Above" },
  { value: "below", label: "Price Below" },
  { value: "pct_change", label: "% Change Exceeds" },
] as const

interface CreateAlertDialogProps {
  onAlertCreated: () => void
}

export function CreateAlertDialog({ onAlertCreated }: CreateAlertDialogProps) {
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState("")
  const [conditionType, setConditionType] = useState<string>("above")
  const [targetValue, setTargetValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!symbol.trim()) {
      setError("Symbol is required")
      return
    }

    if (!targetValue || isNaN(parseFloat(targetValue))) {
      setError("A valid target value is required")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          condition_type: conditionType,
          condition_value: targetValue,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Failed to create alert")
        return
      }

      setSymbol("")
      setConditionType("above")
      setTargetValue("")
      setOpen(false)
      onAlertCreated()
    } catch {
      setError("Failed to create alert")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Alert
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Alert</DialogTitle>
          <DialogDescription>
            Set up a price or percentage change alert for any symbol.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Symbol</label>
            <TickerSearch
              value={symbol}
              onChange={setSymbol}
              onSelect={setSymbol}
              placeholder="e.g. AAPL"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Condition</label>
            <select
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {conditionType === "pct_change" ? "% Threshold" : "Target Price"}
            </label>
            <Input
              type="number"
              step="any"
              placeholder={conditionType === "pct_change" ? "e.g. 5" : "e.g. 150.00"}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
            {conditionType === "pct_change" && (
              <p className="text-xs text-muted-foreground">
                Triggers when the absolute daily % change exceeds this value.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

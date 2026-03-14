"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DollarSign, Briefcase, Loader2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserSettings {
  defaultCurrency?: string
  defaultPaperTrading?: boolean
}

interface PreferencesSettingsProps {
  initialSettings: UserSettings
}

const currencies = [
  { value: "NZD", label: "NZD", flag: "New Zealand Dollar" },
  { value: "USD", label: "USD", flag: "US Dollar" },
  { value: "AUD", label: "AUD", flag: "Australian Dollar" },
  { value: "GBP", label: "GBP", flag: "British Pound" },
  { value: "EUR", label: "EUR", flag: "Euro" },
]

export function PreferencesSettings({ initialSettings }: PreferencesSettingsProps) {
  const [currency, setCurrency] = useState(initialSettings.defaultCurrency ?? "USD")
  const [paperTrading, setPaperTrading] = useState(initialSettings.defaultPaperTrading ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            defaultCurrency: currency,
            defaultPaperTrading: paperTrading,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Default Currency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Default Currency
          </CardTitle>
          <CardDescription>
            Choose your preferred currency for displaying portfolio values
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {currencies.map((c) => (
              <Button
                key={c.value}
                variant="outline"
                onClick={() => setCurrency(c.value)}
                className={cn(
                  "flex-col h-auto py-3",
                  currency === c.value && "border-primary bg-primary/5 ring-1 ring-primary"
                )}
              >
                <span className="font-bold text-base">{c.label}</span>
                <span className="text-[10px] text-muted-foreground">{c.flag}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Portfolio Defaults
          </CardTitle>
          <CardDescription>
            Set defaults for newly created portfolios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex items-center justify-between rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setPaperTrading(!paperTrading)}
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Paper Trading by Default</p>
              <p className="text-xs text-muted-foreground">
                New portfolios will be created in paper trading mode
              </p>
            </div>
            <button
              role="switch"
              aria-checked={paperTrading}
              onClick={(e) => {
                e.stopPropagation()
                setPaperTrading(!paperTrading)
              }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                paperTrading ? "bg-primary" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                  paperTrading ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Saved
              </>
            ) : (
              "Save Preferences"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

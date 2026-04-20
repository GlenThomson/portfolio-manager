"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Plus, Shield, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react"
import { RiskCreateDialog } from "@/components/risks/risk-create-dialog"

interface RiskMonitor {
  id: string
  title: string
  description: string | null
  keywords: string[]
  linked_tickers: string[]
  latest_score: number | null
  latest_score_at: string | null
  alert_on_level: number | null
  alert_on_change: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

function scoreColor(score: number | null) {
  if (score == null) return "#787b86"
  if (score >= 70) return "#ef5350"
  if (score >= 40) return "#ff9500"
  if (score >= 20) return "#ffab00"
  return "#26a69a"
}

function scoreLabel(score: number | null) {
  if (score == null) return "—"
  if (score >= 80) return "Acute"
  if (score >= 60) return "Elevated"
  if (score >= 40) return "Moderate"
  if (score >= 20) return "Background"
  return "Low"
}

export default function RisksPage() {
  const [risks, setRisks] = useState<RiskMonitor[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const fetchRisks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/risks")
      if (res.ok) setRisks(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRisks() }, [fetchRisks])

  const refreshOne = async (id: string) => {
    setRefreshing(id)
    try {
      const res = await fetch(`/api/risks/${id}/compute`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error ?? "Compute failed")
      }
      await fetchRisks()
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Risk Monitors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track any downside risk in plain English. AI scans news daily and scores severity 0-100.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New monitor
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} />
        </div>
      ) : risks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto mb-3" style={{ color: "#787b86" }} />
            <h3 className="font-medium mb-1">No risk monitors yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Describe anything you worry about — Taiwan invasion, banking crisis, Fed pivot, AI regulation — and we&apos;ll track it daily.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create your first monitor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {risks.map((r) => (
            <RiskCard
              key={r.id}
              risk={r}
              refreshing={refreshing === r.id}
              onRefresh={() => refreshOne(r.id)}
            />
          ))}
        </div>
      )}

      <RiskCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchRisks} />
    </div>
  )
}

function RiskCard({ risk, refreshing, onRefresh }: { risk: RiskMonitor; refreshing: boolean; onRefresh: () => void }) {
  const color = scoreColor(risk.latest_score)
  const label = scoreLabel(risk.latest_score)
  const updated = risk.latest_score_at
    ? new Date(risk.latest_score_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "never computed"

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <Link href={`/risks/${risk.id}`} className="flex-1 min-w-0 hover:underline">
            <h3 className="font-semibold truncate">{risk.title}</h3>
            {risk.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{risk.description}</p>
            )}
          </Link>
          <button
            onClick={(e) => { e.preventDefault(); onRefresh() }}
            disabled={refreshing}
            className="p-1 rounded hover:bg-muted"
            title="Refresh score"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#787b86" }} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" style={{ color: "#787b86" }} />
            )}
          </button>
        </div>

        <Link href={`/risks/${risk.id}`}>
          <div className="flex items-end gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</div>
              <div className="text-4xl font-bold leading-none" style={{ color }}>
                {risk.latest_score != null ? Math.round(Number(risk.latest_score)) : "—"}
              </div>
            </div>
            <div className="pb-1">
              <div
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: color + "20", color }}
              >
                {label}
              </div>
            </div>
          </div>
        </Link>

        {risk.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {risk.keywords.slice(0, 4).map((k) => (
              <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {k}
              </span>
            ))}
            {risk.keywords.length > 4 && (
              <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">+{risk.keywords.length - 4}</span>
            )}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground">
          Updated {updated}
        </div>
      </CardContent>
    </Card>
  )
}

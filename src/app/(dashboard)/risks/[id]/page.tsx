"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ArrowLeft, RefreshCw, Shield, Trash2, ExternalLink } from "lucide-react"
import Link from "next/link"

interface Monitor {
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
}

interface Score {
  id: string
  score: number
  summary: string | null
  headlines: Array<{
    title: string
    url: string
    source: string
    publishedAt: string
    severity: number
    direction: "escalating" | "stable" | "deescalating" | "unrelated"
    reasoning: string
  }> | null
  computed_at: string
}

function scoreColor(score: number) {
  if (score >= 70) return "#ef5350"
  if (score >= 40) return "#ff9500"
  if (score >= 20) return "#ffab00"
  return "#26a69a"
}

function directionColor(d: Score["headlines"] extends Array<infer T> ? T extends { direction: infer D } ? D : never : never) {
  return d === "escalating" ? "#ef5350" : d === "deescalating" ? "#26a69a" : d === "stable" ? "#ffab00" : "#787b86"
}

export default function RiskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [monitor, setMonitor] = useState<Monitor | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/risks/${id}`)
      if (!res.ok) {
        setMonitor(null)
        return
      }
      const data = await res.json()
      setMonitor(data.monitor)
      setScores(data.scores ?? [])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/risks/${id}/compute`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error ?? "Refresh failed")
      }
      await fetchData()
    } finally {
      setRefreshing(false)
    }
  }

  const remove = async () => {
    if (!confirm("Delete this risk monitor? Score history will be lost.")) return
    await fetch(`/api/risks?id=${id}`, { method: "DELETE" })
    router.push("/risks")
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} />
      </div>
    )
  }

  if (!monitor) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground mb-4">Risk monitor not found.</p>
        <Button variant="outline" asChild><Link href="/risks">Back to risks</Link></Button>
      </div>
    )
  }

  const latestScore = monitor.latest_score != null ? Math.round(Number(monitor.latest_score)) : null
  const color = latestScore != null ? scoreColor(latestScore) : "#787b86"

  // Chart data
  const chartScores = [...scores].reverse() // oldest first
  const hasHistory = chartScores.length > 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/risks"><ArrowLeft className="h-4 w-4 mr-1" />All risks</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Refresh score
          </Button>
          <Button size="sm" variant="outline" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5" style={{ color }} />
                <h1 className="text-2xl font-bold">{monitor.title}</h1>
              </div>
              {monitor.description && (
                <p className="text-sm text-muted-foreground">{monitor.description}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-3">
                {monitor.keywords.map((k) => (
                  <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {k}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current score</div>
              <div className="text-5xl font-bold leading-none" style={{ color }}>
                {latestScore ?? "—"}
              </div>
              <div className="text-xs mt-1" style={{ color }}>/ 100</div>
            </div>
          </div>

          {/* Latest summary */}
          {scores[0]?.summary && (
            <div className="mt-4 rounded border-l-2 pl-3 py-1" style={{ borderColor: color }}>
              <p className="text-sm">{scores[0].summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score history chart */}
      {hasHistory && (
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Score history</div>
            <ScoreChart scores={chartScores} />
          </CardContent>
        </Card>
      )}

      {/* Latest headlines */}
      {scores[0]?.headlines && scores[0].headlines.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
              Recent headlines (top scored)
            </div>
            <div className="space-y-3">
              {scores[0].headlines.map((h, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="shrink-0">
                    <div
                      className="text-xs font-bold w-8 text-center py-1 rounded"
                      style={{ background: directionColor(h.direction) + "20", color: directionColor(h.direction) }}
                    >
                      {h.severity}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium hover:underline flex items-start gap-1"
                    >
                      {h.title}
                      <ExternalLink className="h-3 w-3 mt-0.5 opacity-60 shrink-0" />
                    </a>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{h.source}</span>
                      <span>·</span>
                      <span>{new Date(h.publishedAt).toLocaleDateString()}</span>
                      <span>·</span>
                      <span style={{ color: directionColor(h.direction) }}>{h.direction}</span>
                    </div>
                    {h.reasoning && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{h.reasoning}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scores.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">No score computed yet.</p>
            <Button size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Compute first score
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ScoreChart({ scores }: { scores: Score[] }) {
  const W = 800
  const H = 120
  const values = scores.map((s) => Number(s.score))
  const max = 100
  const min = 0

  const path = scores
    .map((s, i) => {
      const x = (i / Math.max(1, scores.length - 1)) * W
      const y = H - ((Number(s.score) - min) / (max - min)) * H
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  // Grid lines at 20, 40, 60, 80
  const gridY = [20, 40, 60, 80]

  // Hover state
  const [hover, setHover] = useState<number | null>(null)

  return (
    <div className="relative" style={{ height: 160 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: 140 }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          const idx = Math.round((x / W) * (scores.length - 1))
          setHover(Math.max(0, Math.min(scores.length - 1, idx)))
        }}
      >
        {/* Grid lines */}
        {gridY.map((y) => (
          <line
            key={y}
            x1={0} x2={W}
            y1={H - (y / 100) * H} y2={H - (y / 100) * H}
            stroke="#2a2e39" strokeWidth="0.5" strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Line */}
        <path d={path} fill="none" stroke="#2962ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {/* Hover marker */}
        {hover != null && scores[hover] && (
          <circle
            cx={(hover / Math.max(1, scores.length - 1)) * W}
            cy={H - (Number(scores[hover].score) / 100) * H}
            r="4"
            fill="#2962ff"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* Y-axis labels (HTML overlay) */}
      <div className="absolute left-0 top-0 bottom-6 w-8 text-[9px] text-right pr-1" style={{ color: "#787b86" }}>
        {[100, 75, 50, 25, 0].map((v, i) => (
          <div key={v} style={{ position: "absolute", top: `${(i / 4) * 100}%`, transform: "translateY(-50%)", right: 4 }}>
            {v}
          </div>
        ))}
      </div>
      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] px-1" style={{ color: "#787b86" }}>
        <span>{new Date(scores[0].computed_at).toLocaleDateString()}</span>
        {hover != null && scores[hover] && (
          <span className="font-medium" style={{ color: "#d1d4dc" }}>
            {new Date(scores[hover].computed_at).toLocaleDateString()}: {Math.round(Number(scores[hover].score))}
          </span>
        )}
        <span>{new Date(scores[scores.length - 1].computed_at).toLocaleDateString()}</span>
      </div>
    </div>
  )
}

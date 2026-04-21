"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, ArrowLeft, RefreshCw, Shield, Trash2, ExternalLink, Newspaper, TrendingUp, Target, Plane, Crosshair } from "lucide-react"
import Link from "next/link"

interface Monitor {
  id: string
  title: string
  description: string | null
  keywords: string[]
  linked_tickers: string[]
  hedge_tickers: string[]
  providers: string[]
  latest_score: number | null
  latest_score_at: string | null
  alert_on_level: number | null
  alert_on_change: number | null
  is_active: boolean
}

interface HedgeSignal {
  symbol: string
  currentPrice: number
  rsi14: number | null
  pct5d: number
  pct30d: number
  pctFrom52High: number
  pctFrom52Low: number
  attractiveness: number
  signals: string[]
}

interface Alignment {
  symbol: string
  reason: string
  attractiveness: number
}

interface ProviderBreakdown {
  key: "news" | "market" | "polymarket" | "taiwan_incursions"
  score: number
  weight: number
  summary: string
  data: Record<string, unknown>
  error?: string
}

interface Score {
  id: string
  score: number
  summary: string | null
  components: {
    providers?: ProviderBreakdown[]
    hedges?: HedgeSignal[]
    alignments?: Alignment[]
    totalWeight?: number
  } | null
  headlines: unknown
  computed_at: string
}

function scoreColor(score: number) {
  if (score >= 70) return "#ef5350"
  if (score >= 40) return "#ff9500"
  if (score >= 20) return "#ffab00"
  return "#26a69a"
}

const PROVIDER_LABELS: Record<ProviderBreakdown["key"], { label: string; icon: typeof Newspaper }> = {
  news: { label: "News sentiment", icon: Newspaper },
  market: { label: "Market signals", icon: TrendingUp },
  polymarket: { label: "Prediction markets", icon: Target },
  taiwan_incursions: { label: "PLA ADIZ incursions", icon: Plane },
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
      if (!res.ok) { setMonitor(null); return }
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
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "#787b86" }} /></div>
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
  const chartScores = [...scores].reverse()
  const hasHistory = chartScores.length > 1
  const latestProviders = scores[0]?.components?.providers ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/risks"><ArrowLeft className="h-4 w-4 mr-1" />All risks</Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5" style={{ color }} />
                <h1 className="text-2xl font-bold">{monitor.title}</h1>
              </div>
              {monitor.description && <p className="text-sm text-muted-foreground">{monitor.description}</p>}
              <div className="flex flex-wrap gap-1 mt-3">
                {monitor.providers?.map((p) => {
                  const label = PROVIDER_LABELS[p as ProviderBreakdown["key"]]?.label ?? p
                  return (
                    <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 border border-blue-500/30">
                      {label}
                    </span>
                  )
                })}
                {monitor.keywords.map((k) => (
                  <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{k}</span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Composite score</div>
              <div className="text-5xl font-bold leading-none" style={{ color }}>{latestScore ?? "—"}</div>
              <div className="text-xs mt-1" style={{ color }}>/ 100</div>
            </div>
          </div>
          {scores[0]?.summary && (
            <div className="mt-4 rounded border-l-2 pl-3 py-1" style={{ borderColor: color }}>
              <p className="text-sm">{scores[0].summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider breakdown grid */}
      {latestProviders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {latestProviders.map((p) => (
            <ProviderCard key={p.key} provider={p} />
          ))}
        </div>
      )}

      {/* Hedge candidates */}
      {(monitor.hedge_tickers?.length ?? 0) > 0 && (
        <HedgeCard
          hedges={(scores[0]?.components?.hedges ?? []) as HedgeSignal[]}
          alignments={(scores[0]?.components?.alignments ?? []) as Alignment[]}
          riskScore={latestScore ?? 0}
          monitorTitle={monitor.title}
        />
      )}

      {/* Score history */}
      {hasHistory && (
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Score history</div>
            <ScoreChart scores={chartScores} />
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

// ── Hedge card ────────────────────────────────────────────

function attractColor(score: number) {
  if (score >= 60) return "#26a69a"
  if (score >= 40) return "#ffab00"
  if (score >= 20) return "#787b86"
  return "#4a4e59"
}

function HedgeCard({ hedges, alignments, riskScore, monitorTitle }: { hedges: HedgeSignal[]; alignments: Alignment[]; riskScore: number; monitorTitle: string }) {
  const alignedSyms = new Set(alignments.map((a) => a.symbol))
  const hasAlignment = alignments.length > 0

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: hasAlignment ? "#26a69a" : "#4a4e59" }} />
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crosshair className="h-4 w-4" style={{ color: hasAlignment ? "#26a69a" : "#787b86" }} />
          <div className="text-sm font-semibold">Hedge candidates</div>
          {hasAlignment && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: "#26a69a20", color: "#26a69a" }}>
              ALIGNMENT — risk + entry
            </span>
          )}
        </div>

        {hasAlignment && (
          <div className="rounded p-2 mb-3 text-xs" style={{ background: "#26a69a15", border: "1px solid #26a69a40" }}>
            <strong>{monitorTitle}</strong> risk is {riskScore}/100 AND these hedges show favorable entry conditions:
            <ul className="mt-1 space-y-0.5">
              {alignments.map((a) => (
                <li key={a.symbol}>
                  <Link href={`/stock/${a.symbol}`} className="font-semibold hover:underline">{a.symbol}</Link>
                  <span className="text-muted-foreground ml-2">— {a.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hedges.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No hedge data yet — refresh to compute.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left font-normal py-1">Ticker</th>
                <th className="text-right font-normal">Price</th>
                <th className="text-right font-normal">RSI</th>
                <th className="text-right font-normal">5d</th>
                <th className="text-right font-normal">Off 52w</th>
                <th className="text-right font-normal">Entry</th>
              </tr>
            </thead>
            <tbody>
              {hedges
                .sort((a, b) => b.attractiveness - a.attractiveness)
                .map((h) => {
                  const aligned = alignedSyms.has(h.symbol)
                  return (
                    <tr key={h.symbol} className={aligned ? "bg-emerald-500/5" : ""}>
                      <td className="py-1.5 font-medium">
                        <Link href={`/stock/${h.symbol}`} className="hover:underline">{h.symbol}</Link>
                        {aligned && <span className="ml-1 text-[9px]" style={{ color: "#26a69a" }}>★</span>}
                      </td>
                      <td className="text-right">${h.currentPrice.toFixed(2)}</td>
                      <td className="text-right" style={{ color: h.rsi14 == null ? "#787b86" : h.rsi14 < 30 ? "#26a69a" : h.rsi14 > 70 ? "#ef5350" : "#d1d4dc" }}>
                        {h.rsi14 != null ? h.rsi14.toFixed(0) : "—"}
                      </td>
                      <td className="text-right" style={{ color: h.pct5d >= 0 ? "#26a69a" : "#ef5350" }}>
                        {h.pct5d >= 0 ? "+" : ""}{h.pct5d.toFixed(1)}%
                      </td>
                      <td className="text-right" style={{ color: h.pctFrom52High <= -15 ? "#26a69a" : "#787b86" }}>
                        {h.pctFrom52High.toFixed(1)}%
                      </td>
                      <td className="text-right font-bold" style={{ color: attractColor(h.attractiveness) }}>
                        {h.attractiveness}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}

        {hedges.length > 0 && (
          <div className="mt-3 text-[10px] text-muted-foreground space-y-0.5">
            <div>RSI &lt;30 oversold · 5d return · % below 52w high · Entry score 0-100 (higher = more favorable for protective trades)</div>
            <div>Alignment fires when risk score ≥50 AND any hedge entry score ≥40.</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Provider cards ────────────────────────────────────────

function ProviderCard({ provider }: { provider: ProviderBreakdown }) {
  const meta = PROVIDER_LABELS[provider.key] ?? { label: provider.key, icon: Shield }
  const Icon = meta.icon
  const color = scoreColor(provider.score)
  const disabled = provider.error || provider.weight === 0

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: disabled ? "#787b86" : color }} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: disabled ? "#787b86" : color }} />
            <div className="text-sm font-semibold">{meta.label}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold leading-none" style={{ color: disabled ? "#787b86" : color }}>
              {disabled ? "—" : Math.round(provider.score)}
            </div>
            <div className="text-[10px] text-muted-foreground">weight {Math.round(provider.weight * 100)}%</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{provider.summary}</p>
        <ProviderBody provider={provider} />
      </CardContent>
    </Card>
  )
}

function ProviderBody({ provider }: { provider: ProviderBreakdown }) {
  if (provider.error) {
    return <div className="text-xs text-muted-foreground italic">Error: {provider.error}</div>
  }
  if (provider.key === "news") return <NewsBody data={provider.data} />
  if (provider.key === "market") return <MarketBody data={provider.data} />
  if (provider.key === "polymarket") return <PolymarketBody data={provider.data} />
  if (provider.key === "taiwan_incursions") return <TaiwanBody data={provider.data} />
  return null
}

function NewsBody({ data }: { data: Record<string, unknown> }) {
  const headlines = (data.headlines as Array<{ title: string; url: string; source: string; publishedAt: string; severity: number; direction: string; reasoning: string }>) ?? []
  const top = headlines.slice(0, 5)
  if (top.length === 0) return <div className="text-xs text-muted-foreground italic">No relevant headlines in recent window.</div>
  return (
    <div className="space-y-2">
      {top.map((h, i) => {
        const dirColor = h.direction === "escalating" ? "#ef5350" : h.direction === "deescalating" ? "#26a69a" : h.direction === "stable" ? "#ffab00" : "#787b86"
        return (
          <div key={i} className="flex gap-2 items-start">
            <div className="shrink-0 text-[10px] font-bold w-6 text-center py-0.5 rounded" style={{ background: dirColor + "20", color: dirColor }}>
              {h.severity}
            </div>
            <div className="flex-1 min-w-0">
              <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline flex items-start gap-1">
                <span className="flex-1">{h.title}</span>
                <ExternalLink className="h-3 w-3 opacity-60 shrink-0 mt-0.5" />
              </a>
              <div className="text-[10px] text-muted-foreground">{h.source} · {new Date(h.publishedAt).toLocaleDateString()}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MarketBody({ data }: { data: Record<string, unknown> }) {
  const signals = (data.signals as Array<{ symbol: string; currentPrice: number; pct5d: number; hv20: number; hvBaseline: number; hvZscore: number; signalScore: number; note: string }>) ?? []
  if (signals.length === 0) return <div className="text-xs text-muted-foreground italic">No linked tickers.</div>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left font-normal py-1">Ticker</th>
          <th className="text-right font-normal">Price</th>
          <th className="text-right font-normal">5d</th>
          <th className="text-right font-normal">HV</th>
          <th className="text-right font-normal">vs base</th>
        </tr>
      </thead>
      <tbody>
        {signals.map((s) => (
          <tr key={s.symbol}>
            <td className="py-1 font-medium">
              <Link href={`/stock/${s.symbol}`} className="hover:underline">{s.symbol}</Link>
            </td>
            <td className="text-right">${s.currentPrice.toFixed(2)}</td>
            <td className="text-right" style={{ color: s.pct5d >= 0 ? "#26a69a" : "#ef5350" }}>
              {s.pct5d >= 0 ? "+" : ""}{s.pct5d.toFixed(1)}%
            </td>
            <td className="text-right">{s.hv20.toFixed(0)}%</td>
            <td className="text-right" style={{ color: s.hvZscore > 1 ? "#ef5350" : s.hvZscore > 0 ? "#ffab00" : "#787b86" }}>
              {s.hvZscore >= 0 ? "+" : ""}{s.hvZscore.toFixed(2)}σ
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PolymarketBody({ data }: { data: Record<string, unknown> }) {
  const contracts = (data.contracts as Array<{ question: string; yesPrice: number; volume: number; url: string; endDate?: string | null }>) ?? []
  if (contracts.length === 0) return <div className="text-xs text-muted-foreground italic">No relevant Polymarket contracts.</div>
  return (
    <div className="space-y-2">
      {contracts.slice(0, 5).map((c, i) => {
        const pct = Math.round(c.yesPrice * 100)
        const color = pct >= 50 ? "#ef5350" : pct >= 20 ? "#ffab00" : "#26a69a"
        return (
          <a key={i} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:bg-muted/30 rounded p-1 -mx-1">
            <div className="shrink-0 text-xs font-bold w-10 text-right" style={{ color }}>{pct}%</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs line-clamp-2">{c.question}</div>
              <div className="text-[10px] text-muted-foreground">
                Vol ${(c.volume / 1000).toFixed(0)}k
                {c.endDate && ` · ends ${new Date(c.endDate).toLocaleDateString()}`}
              </div>
            </div>
            <ExternalLink className="h-3 w-3 opacity-60 shrink-0 mt-1" />
          </a>
        )
      })}
    </div>
  )
}

function TaiwanBody({ data }: { data: Record<string, unknown> }) {
  const reports = (data.reports as Array<{ date: string; aircraft: number; vessels: number; crossedMedianLine: boolean; sourceUrl: string; sourceTitle: string }>) ?? []
  const recentAvg = data.recentAvg as number | null
  const baseline = data.baseline as number | null
  const crossedDays = data.crossedMedianDays as number | undefined

  if (reports.length === 0) return <div className="text-xs text-muted-foreground italic">No structured incursion data retrieved.</div>

  const max = Math.max(30, ...reports.slice(0, 10).map((r) => r.aircraft))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Last 7d avg</div>
          <div className="text-lg font-bold">{recentAvg?.toFixed(1) ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Baseline (14d)</div>
          <div className="text-lg font-bold">{baseline?.toFixed(1) ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Median crossings</div>
          <div className="text-lg font-bold">{crossedDays ?? 0}</div>
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground mb-1">Daily incursions</div>
        <div className="space-y-1">
          {reports.slice(0, 10).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <div className="w-16 text-muted-foreground shrink-0">{r.date}</div>
              <div className="flex-1 bg-muted rounded h-4 relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 bottom-0 rounded"
                  style={{ width: `${Math.min(100, (r.aircraft / max) * 100)}%`, background: r.crossedMedianLine ? "#ef5350" : "#2962ff" }}
                />
                <div className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium">
                  {r.aircraft}✈ {r.vessels > 0 && `${r.vessels}🚢`}
                </div>
              </div>
              {r.crossedMedianLine && <span className="text-[10px] text-destructive shrink-0">↔ median</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Score history chart (unchanged) ───────────────────────

function ScoreChart({ scores }: { scores: Score[] }) {
  const W = 800
  const H = 120
  const path = scores
    .map((s, i) => {
      const x = (i / Math.max(1, scores.length - 1)) * W
      const y = H - (Number(s.score) / 100) * H
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
  const gridY = [20, 40, 60, 80]
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
        {gridY.map((y) => (
          <line key={y} x1={0} x2={W} y1={H - (y / 100) * H} y2={H - (y / 100) * H} stroke="#2a2e39" strokeWidth="0.5" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke="#2962ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {hover != null && scores[hover] && (
          <circle cx={(hover / Math.max(1, scores.length - 1)) * W} cy={H - (Number(scores[hover].score) / 100) * H} r="4" fill="#2962ff" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="absolute left-0 top-0 bottom-6 w-8 text-[9px] text-right pr-1" style={{ color: "#787b86" }}>
        {[100, 75, 50, 25, 0].map((v, i) => (
          <div key={v} style={{ position: "absolute", top: `${(i / 4) * 100}%`, transform: "translateY(-50%)", right: 4 }}>{v}</div>
        ))}
      </div>
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

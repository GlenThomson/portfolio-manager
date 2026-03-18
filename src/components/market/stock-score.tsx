"use client"

import { useEffect, useState } from "react"

interface StockScoreData {
  symbol: string
  overall: number
  grade: string
  technical: number
  fundamental: number
  sentiment: number
  momentum: number
  risk: number
  keyDrivers: string[]
  signalFreshness: Record<string, string>
  details: Record<string, string>
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "#26a69a"
  if (grade.startsWith("B")) return "#66bb6a"
  if (grade === "C") return "#ffa726"
  if (grade === "D") return "#ef5350"
  return "#d32f2f"
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "#26a69a"
  if (score >= 50) return "#ffa726"
  return "#ef5350"
}

function freshnessColor(freshness: string): string {
  if (freshness === "fresh") return "#26a69a"
  if (freshness === "aging") return "#ffa726"
  return "#ef5350"
}

function ScoreBar({
  label,
  score,
  detailKeys,
  details,
  freshness,
}: {
  label: string
  score: number
  detailKeys: string[]
  details: Record<string, string>
  freshness?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const relevantDetails = detailKeys
    .map((k) => details[k])
    .filter(Boolean)

  return (
    <div className="space-y-1">
      <button
        className="w-full flex items-center justify-between text-xs"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className="flex items-center gap-1.5" style={{ color: "#d1d4dc" }}>
          {label}
          {freshness && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: freshnessColor(freshness) }}
              title={`Signal: ${freshness}`}
            />
          )}
        </span>
        <span className="font-medium" style={{ color: scoreBarColor(score) }}>
          {score}
        </span>
      </button>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "#2a2e39" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            background: scoreBarColor(score),
          }}
        />
      </div>
      {expanded && relevantDetails.length > 0 && (
        <ul className="text-[10px] space-y-0.5 pl-1 pt-0.5" style={{ color: "#787b86" }}>
          {relevantDetails.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StockScore({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`/api/market/score?symbol=${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) setData(d)
        else setError(true)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#787b86" }}
        >
          AI Score
        </h2>
        <div
          className="rounded-md p-4 space-y-3"
          style={{ background: "#131722" }}
        >
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-slate-800 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-24 bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-full bg-slate-800 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) return null

  const gc = gradeColor(data.grade)
  const freshness = data.signalFreshness ?? {}

  return (
    <div className="space-y-3">
      <h2
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: "#787b86" }}
      >
        AI Score
      </h2>
      <div className="rounded-md p-4" style={{ background: "#131722" }}>
        {/* Grade + overall */}
        <div className="flex items-center gap-4 mb-4">
          <div
            className="flex items-center justify-center h-16 w-16 rounded-full border-2 text-2xl font-bold shrink-0"
            style={{ borderColor: gc, color: gc }}
          >
            {data.grade}
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: "#d1d4dc" }}>
              {data.overall}
              <span className="text-xs font-normal ml-1" style={{ color: "#787b86" }}>
                / 100
              </span>
            </div>
            <div className="text-xs" style={{ color: "#787b86" }}>
              Multi-factor composite score
            </div>
          </div>
        </div>

        {/* Key drivers */}
        {data.keyDrivers && data.keyDrivers.length > 0 && (
          <div
            className="mb-4 p-2.5 rounded text-[11px] space-y-1"
            style={{ background: "#1a1e2e", color: "#a0a4b0" }}
          >
            <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "#787b86" }}>
              Key Drivers
            </div>
            {data.keyDrivers.map((driver, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span style={{ color: "#787b86" }}>{i + 1}.</span>
                <span>{driver}</span>
              </div>
            ))}
          </div>
        )}

        {/* Factor bars */}
        <div className="space-y-3">
          <ScoreBar
            label="Momentum"
            score={data.momentum}
            detailKeys={Object.keys(data.details).filter((k) => k.startsWith("mom_"))}
            details={data.details}
            freshness={freshness.momentum}
          />
          <ScoreBar
            label="Fundamental"
            score={data.fundamental}
            detailKeys={Object.keys(data.details).filter((k) => k.startsWith("fund_"))}
            details={data.details}
            freshness={freshness.fundamental}
          />
          <ScoreBar
            label="Technical"
            score={data.technical}
            detailKeys={Object.keys(data.details).filter((k) => k.startsWith("tech_"))}
            details={data.details}
            freshness={freshness.technical}
          />
          <ScoreBar
            label="Sentiment"
            score={data.sentiment}
            detailKeys={Object.keys(data.details).filter((k) => k.startsWith("sent_"))}
            details={data.details}
            freshness={freshness.sentiment}
          />
          <ScoreBar
            label="Risk"
            score={data.risk}
            detailKeys={Object.keys(data.details).filter((k) => k.startsWith("risk_"))}
            details={data.details}
            freshness={freshness.risk}
          />
        </div>

        <div
          className="text-[10px] mt-3 pt-2 border-t flex items-center justify-between"
          style={{ color: "#787b86", borderColor: "#2a2e39" }}
        >
          <span>Mom 30% | Fund 30% | Tech 20% | Sent 10% | Risk 10%</span>
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#26a69a" }} />
              fresh
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#ffa726" }} />
              aging
            </span>
            <span className="flex items-center gap-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#ef5350" }} />
              stale
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

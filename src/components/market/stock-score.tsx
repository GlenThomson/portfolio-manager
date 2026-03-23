"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface StockScoreData {
  symbol: string
  overall: number
  grade: string
  businessQuality: number
  growthAndEarnings: number
  financialHealth: number
  entryScore: number
  entrySignal: string
  keyDrivers: string[]
  entryDrivers: string[]
  signalFreshness: Record<string, string>
  details: Record<string, string>
  insufficientData?: boolean
  dataCoverage?: number
}

function gradeColor(grade: string): string {
  if (grade === "N/A") return "#787b86"
  if (grade.startsWith("A")) return "#26a69a"
  if (grade.startsWith("B")) return "#66bb6a"
  if (grade === "C") return "#ffa726"
  if (grade === "D") return "#ef5350"
  return "#d32f2f"
}

function entrySignalColor(signal: string): string {
  if (signal === "Strong Buy") return "#26a69a"
  if (signal === "Buy") return "#66bb6a"
  if (signal === "Hold") return "#ffa726"
  if (signal === "Wait") return "#ef5350"
  return "#d32f2f"
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "#26a69a"
  if (score >= 50) return "#ffa726"
  return "#ef5350"
}

function ScoreBar({
  label,
  score,
  detailKeys,
  details,
}: {
  label: string
  score: number
  detailKeys: string[]
  details: Record<string, string>
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
        <span style={{ color: "#d1d4dc" }}>
          {label}
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
  const [expanded, setExpanded] = useState(false)

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
            <div className="h-14 w-14 rounded-full bg-slate-800 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-24 bg-slate-800 rounded animate-pulse" />
              <div className="h-2 w-32 bg-slate-800 rounded animate-pulse" />
            </div>
            <div className="h-14 w-14 rounded-full bg-slate-800 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) return null

  const gc = gradeColor(data.grade)
  const ec = entrySignalColor(data.entrySignal)

  return (
    <div className="space-y-3">
      <h2
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: "#787b86" }}
      >
        AI Score
      </h2>
      <div className="rounded-md p-4" style={{ background: "#131722" }}>
        {/* Investment Grade + Entry Signal side by side */}
        <div className="flex items-center gap-4">
          {/* Investment Grade */}
          <div className="flex items-center gap-3 flex-1">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-full border-2 text-xl font-bold shrink-0"
              style={{ borderColor: gc, color: gc }}
            >
              {data.grade}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#d1d4dc" }}>
                {data.overall}
                <span className="text-xs font-normal ml-1" style={{ color: "#787b86" }}>
                  / 100
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "#787b86" }}>
                Investment Grade
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-10 self-center" style={{ background: "#2a2e39" }} />

          {/* Entry Signal */}
          <div className="flex items-center gap-3 flex-1">
            <div
              className="flex items-center justify-center h-14 w-14 rounded-full border-2 text-xs font-bold shrink-0 text-center leading-tight px-1"
              style={{ borderColor: ec, color: ec }}
            >
              {data.entrySignal}
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#d1d4dc" }}>
                {data.entryScore}
                <span className="text-xs font-normal ml-1" style={{ color: "#787b86" }}>
                  / 100
                </span>
              </div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: "#787b86" }}>
                Entry Timing
              </div>
            </div>
          </div>
        </div>

        {/* Insufficient data warning */}
        {data.insufficientData && (
          <div
            className="mt-3 p-2 rounded text-[11px]"
            style={{ background: "#2a1e1e", color: "#ef5350", border: "1px solid #3a2020" }}
          >
            Limited data available — score may not be reliable. {data.dataCoverage != null && `${Math.round(data.dataCoverage * 100)}% data coverage.`}
          </div>
        )}

        {/* Expand/collapse toggle */}
        <button
          className="w-full flex items-center justify-center gap-1 mt-3 pt-2 border-t text-[11px]"
          style={{ color: "#787b86", borderColor: "#2a2e39" }}
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? "Hide Details" : "Show Details"}
          {expanded
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
          }
        </button>

        {/* Expandable details */}
        {expanded && (
          <div className="mt-3 space-y-4">
            {/* Key drivers for investment grade */}
            {data.keyDrivers && data.keyDrivers.length > 0 && (
              <div
                className="p-2.5 rounded text-[11px] space-y-1"
                style={{ background: "#1a1e2e", color: "#a0a4b0" }}
              >
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "#787b86" }}>
                  Investment Drivers
                </div>
                {data.keyDrivers.map((driver, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span style={{ color: "#787b86" }}>{i + 1}.</span>
                    <span>{driver}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Entry signal drivers */}
            {data.entryDrivers && data.entryDrivers.length > 0 && (
              <div
                className="p-2.5 rounded text-[11px] space-y-1"
                style={{ background: "#1a1e2e", color: "#a0a4b0" }}
              >
                <div className="text-[10px] uppercase tracking-wider font-medium mb-1" style={{ color: "#787b86" }}>
                  Entry Signals
                </div>
                {data.entryDrivers.map((driver, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span style={{ color: "#787b86" }}>{i + 1}.</span>
                    <span>{driver}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Investment Grade breakdown */}
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#787b86" }}>
                Investment Grade Breakdown
              </div>
              <ScoreBar
                label="Business Quality"
                score={data.businessQuality}
                detailKeys={Object.keys(data.details).filter((k) => k.startsWith("fund_"))}
                details={data.details}
              />
              <ScoreBar
                label="Growth & Earnings"
                score={data.growthAndEarnings}
                detailKeys={Object.keys(data.details).filter((k) => k.startsWith("growth_"))}
                details={data.details}
              />
              <ScoreBar
                label="Financial Health"
                score={data.financialHealth}
                detailKeys={Object.keys(data.details).filter((k) => k.startsWith("health_"))}
                details={data.details}
              />
            </div>

            {/* Entry Signal breakdown */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "#787b86" }}>
                Entry Timing Breakdown
              </div>
              {["entry_rsi", "entry_bollinger", "entry_sma200Distance", "entry_pullback"]
                .map((k) => data.details[k])
                .filter(Boolean)
                .map((detail, i) => (
                  <div key={i} className="text-[11px]" style={{ color: "#a0a4b0" }}>
                    {detail}
                  </div>
                ))}
            </div>

            <div
              className="text-[10px] pt-2 border-t"
              style={{ color: "#787b86", borderColor: "#2a2e39" }}
            >
              Quality 50% | Growth 25% | Health 15% | Insider 5% | Risk 5%
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

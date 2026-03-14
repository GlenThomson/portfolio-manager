"use client"

import { useEffect, useState } from "react"

interface Fundamentals {
  marketCap: number
  trailingPE: number | null
  forwardPE: number | null
  eps: number | null
  dividendYield: number | null
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  averageVolume: number
  beta: number | null
  priceToBook: number | null
}

function formatLargeNum(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

function formatRatio(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return "--"
  return n.toFixed(2)
}

function formatPercent(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return "--"
  return `${(n * 100).toFixed(2)}%`
}

export function FundamentalsGrid({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Fundamentals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/market/fundamentals?symbol=${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#787b86" }}>
          Fundamentals
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px rounded-md overflow-hidden" style={{ background: "#2a2e39" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="px-3 py-3" style={{ background: "#131722" }}>
              <div className="h-3 w-16 bg-slate-800 rounded animate-pulse mb-1.5" />
              <div className="h-4 w-20 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const metrics = [
    { label: "Market Cap", value: formatLargeNum(data.marketCap) },
    { label: "P/E Ratio", value: formatRatio(data.trailingPE) },
    { label: "EPS", value: data.eps !== null ? `$${formatRatio(data.eps)}` : "--" },
    { label: "Dividend Yield", value: formatPercent(data.dividendYield) },
    { label: "52W High", value: `$${data.fiftyTwoWeekHigh.toFixed(2)}` },
    { label: "52W Low", value: `$${data.fiftyTwoWeekLow.toFixed(2)}` },
    { label: "Avg Volume", value: formatVolume(data.averageVolume) },
    { label: "Beta", value: formatRatio(data.beta) },
    { label: "Forward P/E", value: formatRatio(data.forwardPE) },
    { label: "Price/Book", value: formatRatio(data.priceToBook) },
  ]

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#787b86" }}>
        Fundamentals
      </h2>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px rounded-md overflow-hidden"
        style={{ background: "#2a2e39" }}
      >
        {metrics.map((metric) => (
          <div key={metric.label} className="px-3 py-3" style={{ background: "#131722" }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "#787b86" }}>
              {metric.label}
            </div>
            <div className="text-sm font-medium" style={{ color: "#d1d4dc" }}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

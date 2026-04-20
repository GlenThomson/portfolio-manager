"use client"

import type { PendulumData } from "@/lib/market/options-math"

const BG = "#131722"
const BORDER = "#2a2e39"
const TEXT_DIM = "#787b86"
const TEXT = "#d1d4dc"

interface OptionsPendulumProps {
  data: PendulumData
  ivStats: { avg: number; high: number; low: number; median: number; rank: number }
  underlyingPrice: number
  daysToExpiry: number
}

function scoreColor(score: number, context: "sell" | "buy" | "balanced"): string {
  if (context === "buy") {
    // Buying: low = good (green/cheap), high = bad (red/expensive)
    if (score <= 30) return "#26a69a"
    if (score >= 70) return "#ef5350"
    return "#ffab00"
  }
  // Selling: high = good (green/rich premiums), low = bad (red/thin)
  if (score >= 70) return "#26a69a"
  if (score <= 30) return "#ef5350"
  return "#ffab00"
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: TEXT }}>{value}</div>
    </div>
  )
}

export function OptionsPendulum({ data, ivStats, underlyingPrice, daysToExpiry }: OptionsPendulumProps) {
  const color = scoreColor(data.score, data.context)
  const isBuy = data.context === "buy"

  return (
    <div className="rounded-md p-3 space-y-3" style={{ background: BG, border: `1px solid ${BORDER}` }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Score — big and obvious */}
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>
              {isBuy ? "Buy Signal" : "Sell Signal"}
            </div>
            <div className="text-3xl font-bold leading-none" style={{ color }}>
              {data.score}
              <span className="text-sm font-medium ml-2">/100</span>
            </div>
          </div>
          {/* Gauge bar */}
          <div className="flex flex-col gap-0.5">
            <div className="w-28 h-3 rounded-full overflow-hidden" style={{ background: "#1e222d" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${data.score}%`, background: color }}
              />
            </div>
            <div className="flex justify-between text-[8px]" style={{ color: TEXT_DIM }}>
              <span>{isBuy ? "Cheap" : "Thin"}</span>
              <span>{isBuy ? "Expensive" : "Rich"}</span>
            </div>
          </div>
        </div>

        {/* Verdict label */}
        <span
          className="text-xs px-2.5 py-1 rounded font-medium"
          style={{ background: color + "20", color }}
        >
          {data.label}
        </span>

        {/* Key stats */}
        <StatCell label="IV Rank" value={`${ivStats.rank}`} />
        <StatCell label="ATM IV" value={`${ivStats.median.toFixed(1)}%`} />
        <StatCell label="HV" value={data.hvAnnualized > 0 ? `${data.hvAnnualized.toFixed(1)}%` : "—"} />
        <StatCell label="DTE" value={daysToExpiry.toString()} />
        <StatCell label="Price" value={`$${underlyingPrice.toFixed(2)}`} />
      </div>

      {/* HV history chart */}
      {data.hvHistory && data.hvHistory.length > 10 && (
        <HvChart history={data.hvHistory} currentIV={data.atmIV} />
      )}
    </div>
  )
}

// ── HV vs IV historical chart ───────────────────────────────

function HvChart({ history, currentIV }: { history: { time: number; hv: number }[]; currentIV: number }) {
  // SVG uses a normalised 0-1000 × 0-100 coordinate space; preserveAspectRatio="none"
  // stretches the paths to fill. Axis labels are HTML overlays (so text stays crisp).
  const SVG_W = 1000
  const SVG_H = 100

  const hvs = history.map((p) => p.hv)
  const yMax = Math.max(Math.max(...hvs), currentIV) * 1.1
  const yMin = 0
  const yRange = yMax - yMin || 1

  const xMin = history[0].time
  const xMax = history[history.length - 1].time
  const xRange = xMax - xMin || 1

  // Map a value to SVG coords (inside 0..SVG_W, 0..SVG_H)
  const xSvg = (t: number) => ((t - xMin) / xRange) * SVG_W
  const ySvg = (v: number) => (1 - (v - yMin) / yRange) * SVG_H

  // HV path + area
  const hvPath = history
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xSvg(p.time).toFixed(2)} ${ySvg(p.hv).toFixed(2)}`)
    .join(" ")
  const areaPath = hvPath + ` L ${SVG_W} ${SVG_H} L 0 ${SVG_H} Z`

  // IV horizontal line as percent of height (for overlay positioning)
  const ivYPct = (1 - (currentIV - yMin) / yRange) * 100

  // Y-axis ticks (percent of chart height, from top)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const value = yMin + (1 - frac) * yRange
    return { topPct: frac * 100, value }
  })

  // X-axis month labels (6 evenly spaced across the time range)
  const monthCount = 6
  const monthTicks = Array.from({ length: monthCount }, (_, i) => {
    const t = xMin + (i / (monthCount - 1)) * xRange
    return {
      leftPct: (i / (monthCount - 1)) * 100,
      label: new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      idx: i,
    }
  })

  const isIvHigh = currentIV > (history[history.length - 1]?.hv ?? 0)
  const ivColor = isIvHigh ? "#26a69a" : "#ef5350"

  // Layout — SVG drawing area is inset to leave room for Y-axis labels on left
  // and X-axis labels at bottom. We use padding on the wrapping div.
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>
          Realised Volatility (20d) — 12 months
        </span>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1" style={{ color: TEXT_DIM }}>
            <span className="inline-block w-3 h-0.5" style={{ background: "#5b7fb0" }} />
            HV 20d
          </span>
          <span className="flex items-center gap-1" style={{ color: ivColor }}>
            <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: ivColor }} />
            Current IV {currentIV.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="relative" style={{ height: 180, paddingLeft: 42, paddingRight: 8, paddingBottom: 22 }}>
        {/* Y-axis labels (HTML, crisp) */}
        {yTicks.map((tick) => (
          <div
            key={tick.topPct}
            className="absolute text-[10px] text-right pr-1"
            style={{
              top: `calc(${tick.topPct}% * (100% - 22px) / 100% - 6px)`,
              left: 0,
              width: 38,
              color: TEXT_DIM,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(tick.value)}%
          </div>
        ))}

        {/* Chart SVG — fills the inner area, paths stretch via preserveAspectRatio="none" */}
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          style={{ left: 42, top: 0, width: "calc(100% - 50px)", height: "calc(100% - 22px)" }}
        >
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <line
              key={tick.topPct}
              x1={0} x2={SVG_W}
              y1={(tick.topPct / 100) * SVG_H} y2={(tick.topPct / 100) * SVG_H}
              stroke={BORDER} strokeWidth="0.3" strokeDasharray="1 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* HV area */}
          <path d={areaPath} fill="#5b7fb0" opacity="0.15" />
          {/* HV line */}
          <path d={hvPath} fill="none" stroke="#5b7fb0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {/* Current IV horizontal line */}
          <line
            x1={0} x2={SVG_W}
            y1={(ivYPct / 100) * SVG_H} y2={(ivYPct / 100) * SVG_H}
            stroke={ivColor} strokeWidth="1.5" strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* IV label (HTML, crisp) — positioned at right, at IV level */}
        <div
          className="absolute text-[10px] font-semibold pr-2"
          style={{
            right: 0,
            top: `calc(${ivYPct}% * (100% - 22px) / 100% - 14px)`,
            color: ivColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          IV {currentIV.toFixed(1)}%
        </div>

        {/* X-axis labels (HTML, crisp) */}
        {monthTicks.map((tick) => (
          <div
            key={tick.idx}
            className="absolute text-[10px]"
            style={{
              left: `calc(42px + ${tick.leftPct}% * (100% - 50px) / 100%)`,
              bottom: 0,
              transform:
                tick.idx === 0 ? "translateX(0)" : tick.idx === monthCount - 1 ? "translateX(-100%)" : "translateX(-50%)",
              color: TEXT_DIM,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tick.label}
          </div>
        ))}
      </div>

      <div className="text-[10px] mt-1" style={{ color: TEXT_DIM }}>
        {isIvHigh
          ? "IV above realised vol — options pricing in more movement than recent history → premiums are expensive (good for selling)"
          : "IV below realised vol — options pricing in less movement than recent history → premiums are cheap (good for buying)"}
      </div>
    </div>
  )
}

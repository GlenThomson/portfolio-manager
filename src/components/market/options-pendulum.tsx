"use client"

import type { PendulumData } from "@/lib/market/options-math"

const TEXT_DIM = "#787b86"

interface OptionsPendulumProps {
  data: PendulumData
}

export function OptionsPendulum({ data }: OptionsPendulumProps) {
  const R = 80
  const CX = 100
  const CY = 92

  const arcPoint = (pct: number) => {
    const angle = Math.PI * (1 - pct)
    return {
      x: CX + R * Math.cos(angle),
      y: CY - R * Math.sin(angle),
    }
  }

  const needlePct = data.score / 100
  const needleEnd = arcPoint(needlePct)

  // 3 zones: Buy (blue), Neutral (grey), Sell (green)
  const zones = [
    { from: 0, to: 0.3, color: "#2962ff", label: "Buy" },
    { from: 0.3, to: 0.7, color: "#4a4e59", label: "Neutral" },
    { from: 0.7, to: 1, color: "#26a69a", label: "Sell" },
  ]

  const needleColor =
    data.score <= 30 ? "#2962ff" : data.score >= 70 ? "#26a69a" : "#787b86"

  const makeArc = (fromPct: number, toPct: number) => {
    const start = arcPoint(fromPct)
    const end = arcPoint(toPct)
    const largeArc = toPct - fromPct > 0.5 ? 1 : 0
    return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  return (
    <div className="rounded-md p-3" style={{ background: "#131722", border: "1px solid #2a2e39" }}>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Gauge */}
        <div className="flex flex-col items-center shrink-0">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: TEXT_DIM }}>
            Options Pendulum
          </div>
          <div className="w-44 h-24">
            <svg viewBox="0 0 200 105" className="w-full h-full">
              {/* Zone arcs (dimmed) */}
              {zones.map((zone) => (
                <path
                  key={zone.from}
                  d={makeArc(zone.from, zone.to)}
                  fill="none"
                  stroke={zone.color}
                  strokeWidth="12"
                  strokeLinecap="butt"
                  opacity="0.25"
                />
              ))}
              {/* Active zone (bright) */}
              {zones.map((zone) => {
                if (needlePct < zone.from || needlePct > zone.to) return null
                return (
                  <path
                    key={`a-${zone.from}`}
                    d={makeArc(zone.from, zone.to)}
                    fill="none"
                    stroke={zone.color}
                    strokeWidth="12"
                    strokeLinecap="butt"
                  />
                )
              })}
              {/* Needle */}
              <line
                x1={CX} y1={CY}
                x2={needleEnd.x} y2={needleEnd.y}
                stroke={needleColor} strokeWidth="2.5" strokeLinecap="round"
              />
              <circle cx={CX} cy={CY} r="4" fill={needleColor} />
              {/* Labels */}
              <text x="10" y="102" fontSize="8" fill="#2962ff" textAnchor="start">Buy</text>
              <text x="100" y="8" fontSize="8" fill={TEXT_DIM} textAnchor="middle">50</text>
              <text x="190" y="102" fontSize="8" fill="#26a69a" textAnchor="end">Sell</text>
            </svg>
          </div>
          <div className="text-center -mt-1">
            <span className="text-xl font-bold" style={{ color: needleColor }}>{data.score}</span>
            <span className="text-xs ml-1.5" style={{ color: needleColor }}>{data.label}</span>
          </div>
        </div>

        {/* Signal breakdown */}
        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs min-w-0">
          <SignalBar label="IV Rank" value={data.ivRankSignal} weight="35%" />
          <SignalBar label="IV vs HV" value={data.ivHvSignal} weight="30%" />
          <SignalBar label="Put/Call Skew" value={data.skewSignal} weight="15%" />
          <SignalBar label="Premium Yield" value={data.yieldSignal} weight="20%" />
          <div className="col-span-2 flex gap-4 mt-1 text-[10px]" style={{ color: TEXT_DIM }}>
            <span>HV20: {data.hv20.toFixed(1)}%</span>
            <span>HV Ann: {data.hvAnnualized.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SignalBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const barColor =
    value <= 30 ? "#2962ff" : value >= 70 ? "#26a69a" : "#4a4e59"

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-0.5">
          <span style={{ color: "#d1d4dc" }}>{label}</span>
          <span style={{ color: TEXT_DIM }}>{weight}</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#1e222d" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${value}%`, background: barColor }}
          />
        </div>
      </div>
      <span className="w-6 text-right font-mono" style={{ color: barColor }}>{value}</span>
    </div>
  )
}

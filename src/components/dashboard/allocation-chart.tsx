"use client"

import { useMemo } from "react"

interface Holding {
  symbol: string
  value: number
}

interface AllocationChartProps {
  holdings: Holding[]
  cashTotal?: number
  currencySymbol?: string
  fxRate?: number
}

const COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
  "#a855f7", // purple
  "#e11d48", // rose
]

export function AllocationChart({ holdings, cashTotal = 0, currencySymbol = "$", fxRate = 1 }: AllocationChartProps) {
  const data = useMemo(() => {
    // Aggregate by symbol
    const map = new Map<string, number>()
    for (const h of holdings) {
      map.set(h.symbol, (map.get(h.symbol) ?? 0) + h.value)
    }
    // Sort descending by value
    return Array.from(map.entries())
      .map(([symbol, value]) => ({ symbol, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [holdings])

  const totalStockValue = data.reduce((sum, d) => sum + d.value, 0)
  const grandTotal = totalStockValue + cashTotal

  if (data.length === 0 && cashTotal <= 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No holdings to display
      </div>
    )
  }

  // SVG donut chart
  const size = 180
  const strokeWidth = 36
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  let accumulated = 0
  const segments = data.map((d, i) => {
    const pct = totalStockValue > 0 ? d.value / totalStockValue : 0
    const dashLength = pct * circumference
    const dashOffset = -accumulated * circumference
    accumulated += pct
    return {
      ...d,
      color: COLORS[i % COLORS.length],
      pct,
      dashLength,
      dashOffset,
    }
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      {/* Donut */}
      <div className="relative flex-shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {segments.map((seg) => (
            <circle
              key={seg.symbol}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
              strokeDashoffset={seg.dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-300"
            />
          ))}
          {/* Center text */}
          <text
            x={center}
            y={center - 8}
            textAnchor="middle"
            className="fill-foreground text-xs font-medium"
          >
            {data.length} stocks
          </text>
          <text
            x={center}
            y={center + 10}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {currencySymbol}{(grandTotal * fxRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-1.5 min-w-0 max-h-[360px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {segments.map((seg) => (
          <div key={seg.symbol} className="flex items-center gap-2 text-sm">
            <div
              className="h-3 w-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="font-medium truncate">{seg.symbol}</span>
            <span className="text-muted-foreground ml-auto flex-shrink-0">
              {(seg.pct * 100).toFixed(1)}%
            </span>
            <span className="text-muted-foreground flex-shrink-0 w-20 text-right">
              {currencySymbol}{(seg.value * fxRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
        {cashTotal > 0 && (
          <div className="flex items-center gap-2 text-sm border-t border-border pt-1.5 mt-1.5">
            <div className="h-3 w-3 rounded-sm flex-shrink-0 bg-slate-500" />
            <span className="font-medium truncate">Cash</span>
            <span className="text-muted-foreground ml-auto flex-shrink-0">
              {grandTotal > 0 ? ((cashTotal / grandTotal) * 100).toFixed(1) : "0.0"}%
            </span>
            <span className="text-muted-foreground flex-shrink-0 w-20 text-right">
              {currencySymbol}{(cashTotal * fxRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

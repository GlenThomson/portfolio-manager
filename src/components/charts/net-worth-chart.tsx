"use client"

import { useEffect, useRef } from "react"
import { createChart, ColorType, type Time, AreaSeries } from "lightweight-charts"

interface NetWorthChartProps {
  data: { date: string; net_worth: number }[]
  height?: number
}

export function NetWorthChart({ data, height = 200 }: NetWorthChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return

    const chart = createChart(containerRef.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#787b86",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        horzLine: { visible: false, labelVisible: false },
        vertLine: { labelVisible: true },
      },
      handleScroll: false,
      handleScale: false,
    })

    const isPositive = data.length >= 2 && data[data.length - 1].net_worth >= data[0].net_worth
    const lineColor = isPositive ? "#22c55e" : "#ef4444"

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: `${lineColor}40`,
      bottomColor: `${lineColor}05`,
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    })

    series.setData(
      data.map((d) => ({
        time: d.date as Time,
        value: d.net_worth,
      }))
    )

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [data, height])

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Net worth history will appear as data builds up over time.
      </div>
    )
  }

  return <div ref={containerRef} />
}

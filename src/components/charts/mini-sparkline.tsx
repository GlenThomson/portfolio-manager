"use client"

import { useEffect, useRef } from "react"
import { createChart, ColorType, type Time, AreaSeries } from "lightweight-charts"

interface MiniSparklineProps {
  data: { time: number; value: number }[]
  color?: string
  width?: number
  height?: number
}

export function MiniSparkline({ data, color, width = 120, height = 40 }: MiniSparklineProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  const isPositive = data.length >= 2 && data[data.length - 1].value >= data[0].value
  const lineColor = color ?? (isPositive ? "#22c55e" : "#ef4444")

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return

    const chart = createChart(chartRef.current, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: `${lineColor}33`,
      bottomColor: `${lineColor}05`,
      lineWidth: 2,
      crosshairMarkerVisible: false,
    })

    series.setData(
      data.map((d) => ({ time: d.time as Time, value: d.value }))
    )

    chart.timeScale().fitContent()

    return () => chart.remove()
  }, [data, lineColor, width, height])

  return <div ref={chartRef} />
}

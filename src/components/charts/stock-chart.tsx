"use client"

import { useEffect, useRef, useState } from "react"
import {
  createChart,
  type IChartApi,
  ColorType,
  type CandlestickData,
  type HistogramData,
  type Time,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts"
import { calcSMA, calcRSI, calcMACD } from "@/lib/market/indicators"
import type { OHLC } from "@/types/market"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const periods = [
  { label: "1D", value: "1d", interval: "5m" },
  { label: "5D", value: "5d", interval: "15m" },
  { label: "1M", value: "1mo", interval: "1h" },
  { label: "3M", value: "3mo", interval: "1d" },
  { label: "6M", value: "6mo", interval: "1d" },
  { label: "1Y", value: "1y", interval: "1d" },
  { label: "2Y", value: "2y", interval: "1wk" },
]

interface StockChartProps {
  symbol: string
  data: OHLC[]
  onPeriodChange: (period: string, interval: string) => void
  activePeriod: string
}

export function StockChart({ symbol, data, onPeriodChange, activePeriod }: StockChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null)
  const rsiChartRef = useRef<HTMLDivElement>(null)
  const macdChartRef = useRef<HTMLDivElement>(null)
  const [showRSI, setShowRSI] = useState(true)
  const [showMACD, setShowMACD] = useState(true)

  useEffect(() => {
    if (!mainChartRef.current || data.length === 0) return

    const chartOptions = {
      layout: {
        textColor: "hsl(215, 20.2%, 65.1%)",
        background: { type: ColorType.Solid as const, color: "transparent" },
      },
      grid: {
        vertLines: { color: "hsl(217.2, 32.6%, 17.5%)" },
        horzLines: { color: "hsl(217.2, 32.6%, 17.5%)" },
      },
      crosshair: { mode: 0 as const },
      rightPriceScale: { borderColor: "hsl(217.2, 32.6%, 17.5%)" },
      timeScale: { borderColor: "hsl(217.2, 32.6%, 17.5%)", timeVisible: true },
    }

    // Main chart with candlesticks
    const mainChart = createChart(mainChartRef.current, {
      ...chartOptions,
      height: 400,
    })

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    })

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))
    candleSeries.setData(candleData)

    // Volume
    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    })
    mainChart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })
    const volumeData: HistogramData[] = data.map((d) => ({
      time: d.time as Time,
      value: d.volume,
      color: d.close >= d.open ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
    }))
    volumeSeries.setData(volumeData)

    // SMA 50
    if (data.length > 50) {
      const sma50 = calcSMA(data, 50)
      const sma50Series = mainChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
        title: "SMA 50",
      })
      sma50Series.setData(sma50.map((d) => ({ time: d.time as Time, value: d.value })))
    }

    // SMA 200
    if (data.length > 200) {
      const sma200 = calcSMA(data, 200)
      const sma200Series = mainChart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1,
        title: "SMA 200",
      })
      sma200Series.setData(sma200.map((d) => ({ time: d.time as Time, value: d.value })))
    }

    mainChart.timeScale().fitContent()

    // Track all charts for resize
    const charts: IChartApi[] = [mainChart]

    // RSI chart
    let rsiChart: IChartApi | undefined
    if (showRSI && rsiChartRef.current && data.length > 14) {
      rsiChart = createChart(rsiChartRef.current, {
        ...chartOptions,
        height: 150,
      })

      const rsiData = calcRSI(data)
      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: "#a855f7",
        lineWidth: 2,
        title: "RSI(14)",
      })
      rsiSeries.setData(rsiData.map((d) => ({ time: d.time as Time, value: d.value })))

      // Overbought/oversold lines
      const addLevel = (value: number, color: string) => {
        const line = rsiChart!.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: 2,
        })
        line.setData(
          rsiData.map((d) => ({ time: d.time as Time, value }))
        )
      }
      addLevel(70, "rgba(239, 68, 68, 0.5)")
      addLevel(30, "rgba(34, 197, 94, 0.5)")

      rsiChart.timeScale().fitContent()
      charts.push(rsiChart)

      // Sync time scales
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) rsiChart?.timeScale().setVisibleLogicalRange(range)
      })
    }

    // MACD chart
    let macdChart: IChartApi | undefined
    if (showMACD && macdChartRef.current && data.length > 26) {
      macdChart = createChart(macdChartRef.current, {
        ...chartOptions,
        height: 150,
      })

      const macd = calcMACD(data)

      const macdLineSeries = macdChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        title: "MACD",
      })
      macdLineSeries.setData(macd.macdLine.map((d) => ({ time: d.time as Time, value: d.value })))

      const signalSeries = macdChart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 1,
        title: "Signal",
      })
      signalSeries.setData(macd.signalLine.map((d) => ({ time: d.time as Time, value: d.value })))

      const histogramSeries = macdChart.addSeries(HistogramSeries, {
        title: "Histogram",
      })
      histogramSeries.setData(
        macd.histogram.map((d) => ({
          time: d.time as Time,
          value: d.value,
          color: d.value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)",
        }))
      )

      macdChart.timeScale().fitContent()
      charts.push(macdChart)

      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) macdChart?.timeScale().setVisibleLogicalRange(range)
      })
    }

    // Resize all charts when container width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          charts.forEach((chart) => chart.applyOptions({ width }))
        }
      }
    })
    resizeObserver.observe(mainChartRef.current)

    return () => {
      resizeObserver.disconnect()
      mainChart.remove()
      rsiChart?.remove()
      macdChart?.remove()
    }
  }, [data, showRSI, showMACD])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{symbol}</CardTitle>
          <div className="flex gap-1">
            {periods.map((p) => (
              <Button
                key={p.value}
                variant={activePeriod === p.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onPeriodChange(p.value, p.interval)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <Button
            variant={showRSI ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowRSI(!showRSI)}
          >
            RSI
          </Button>
          <Button
            variant={showMACD ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowMACD(!showMACD)}
          >
            MACD
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mainChartRef} />
        {showRSI && <div ref={rsiChartRef} className="border-t border-border" />}
        {showMACD && <div ref={macdChartRef} className="border-t border-border" />}
      </CardContent>
    </Card>
  )
}

"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  type CandlestickData,
  type HistogramData,
  type Time,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts"
import { calcSMA, calcEMA, calcRSI, calcMACD, calcBollingerBands } from "@/lib/market/indicators"
import type { OHLC } from "@/types/market"
import { cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────

// Interval buttons — primary selector (like TradingView)
const intervals = [
  { label: "1m", interval: "1m", defaultPeriod: "5d" },
  { label: "5m", interval: "5m", defaultPeriod: "1mo" },
  { label: "15m", interval: "15m", defaultPeriod: "1mo" },
  { label: "1h", interval: "1h", defaultPeriod: "6mo" },
  { label: "4h", interval: "4h", defaultPeriod: "1y" },
  { label: "D", interval: "1d", defaultPeriod: "2y" },
  { label: "W", interval: "1wk", defaultPeriod: "5y" },
]


const CHART_BG = "#131722"
const GRID_COLOR = "#1e222d"
const TEXT_COLOR = "#787b86"
const BORDER_COLOR = "#2a2e39"
const CROSSHAIR_COLOR = "#555"
const UP_COLOR = "#26a69a"
const DOWN_COLOR = "#ef5350"

interface Indicator {
  id: string
  label: string
  active: boolean
  overlay: boolean // true = on main chart, false = separate pane
}

const DEFAULT_INDICATORS: Indicator[] = [
  { id: "vol", label: "Vol", active: true, overlay: true },
  { id: "sma20", label: "SMA 20", active: false, overlay: true },
  { id: "sma50", label: "SMA 50", active: true, overlay: true },
  { id: "sma200", label: "SMA 200", active: false, overlay: true },
  { id: "ema12", label: "EMA 12", active: false, overlay: true },
  { id: "ema26", label: "EMA 26", active: false, overlay: true },
  { id: "bb", label: "BB(20,2)", active: false, overlay: true },
  { id: "rsi", label: "RSI(14)", active: true, overlay: false },
  { id: "macd", label: "MACD", active: false, overlay: false },
]

const SMA_CONFIGS = [
  { id: "sma20", period: 20, color: "#ff9800" },
  { id: "sma50", period: 50, color: "#2196f3" },
  { id: "sma200", period: 200, color: "#e040fb" },
]

const EMA_CONFIGS = [
  { id: "ema12", period: 12, color: "#00bcd4" },
  { id: "ema26", period: 26, color: "#ff5722" },
]

// ── Types ────────────────────────────────────────────────

interface ChartAlert {
  id: string
  price: number
  condition: string
}

interface StockChartProps {
  symbol: string
  data: OHLC[]
  onPeriodChange: (period: string, interval: string) => void
  activeInterval: string
  activePeriod?: string
  onLoadMore?: (beforeTimestamp: number) => void
  onCreateAlert?: (symbol: string, price: number, condition: "above" | "below") => void
  onRemoveAlert?: (alertId: string) => void
  onMoveAlert?: (alertId: string, newPrice: number) => void
  alerts?: ChartAlert[]
}

interface OHLCLegend {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
  changePct: number
}

// ── Helpers ──────────────────────────────────────────────

function formatVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function filterClean(data: OHLC[]): OHLC[] {
  return data.filter((d) => d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0)
}

// ── Component ────────────────────────────────────────────

export function StockChart({ symbol, data, onPeriodChange, activeInterval, onLoadMore, onCreateAlert, onRemoveAlert, onMoveAlert, alerts = [] }: StockChartProps) {
  const mainChartRef = useRef<HTMLDivElement>(null)
  const rsiChartRef = useRef<HTMLDivElement>(null)
  const macdChartRef = useRef<HTMLDivElement>(null)
  const [indicators, setIndicators] = useState<Indicator[]>(DEFAULT_INDICATORS)
  const [legend, setLegend] = useState<OHLCLegend | null>(null)
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [alertCoords, setAlertCoords] = useState<Array<{ id: string; price: number; y: number }>>([])
  const alertUpdateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [draggingAlert, setDraggingAlert] = useState<{ id: string; startY: number; currentY: number } | null>(null)
  const [logScale, setLogScale] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("chart-log-scale") === "true"
    }
    return false
  })
  const menuRef = useRef<HTMLDivElement>(null)

  // Stable refs for callbacks (avoid putting these in effect deps)
  const dataRef = useRef<OHLC[]>(data)
  dataRef.current = data
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const loadMoreCooldownRef = useRef(false)

  // Chart + series refs (persist between data updates, reset on chart recreation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartsRef = useRef<{
    main: IChartApi | null
    rsi: IChartApi | null
    macd: IChartApi | null
    series: Record<string, ISeriesApi<any>>
    alertLines?: any[]
  }>({ main: null, rsi: null, macd: null, series: {} })

  // Track last dataset endpoint to detect fresh load vs prepend
  const lastDataEndRef = useRef<number | null>(null)

  const showRSI = indicators.find((i) => i.id === "rsi")?.active ?? false
  const showMACD = indicators.find((i) => i.id === "macd")?.active ?? false

  // Set initial legend from last candle
  useEffect(() => {
    if (data.length > 0) {
      const last = data[data.length - 1]
      const prev = data.length > 1 ? data[data.length - 2] : last
      setLegend({
        time: formatTime(last.time),
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
        change: last.close - prev.close,
        changePct: prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
      })
    }
  }, [data])

  // Close indicator menu and context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowIndicatorMenu(false)
      }
      // Only dismiss context menu if click is outside of it
      const target = e.target as HTMLElement
      if (!target.closest("[data-alert-menu]")) {
        setContextMenu(null)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const toggleIndicator = useCallback((id: string) => {
    setIndicators((prev) => prev.map((ind) => ind.id === id ? { ...ind, active: !ind.active } : ind))
  }, [])

  const toggleLogScale = useCallback(() => {
    setLogScale((prev) => {
      const next = !prev
      localStorage.setItem("chart-log-scale", String(next))
      return next
    })
  }, [])

  // ── Shared: populate all series from current data ──────

  const populateAllSeries = useCallback(() => {
    const { series } = chartsRef.current
    const cleanData = filterClean(dataRef.current)
    if (cleanData.length === 0) return

    // Candle
    if (series["candle"]) {
      series["candle"].setData(cleanData.map((d) => ({
        time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close,
      })))
    }

    // Volume
    if (series["volume"]) {
      series["volume"].setData(cleanData.map((d) => ({
        time: d.time as Time, value: d.volume,
        color: d.close >= d.open ? "rgba(38, 166, 154, 0.25)" : "rgba(239, 83, 80, 0.25)",
      })))
    }

    // SMA
    for (const cfg of SMA_CONFIGS) {
      if (series[cfg.id] && cleanData.length > cfg.period) {
        const smaData = calcSMA(cleanData, cfg.period)
        series[cfg.id].setData(smaData.map((d) => ({ time: d.time as Time, value: d.value })))
      }
    }

    // EMA
    for (const cfg of EMA_CONFIGS) {
      if (series[cfg.id] && cleanData.length > cfg.period) {
        const emaData = calcEMA(cleanData, cfg.period)
        series[cfg.id].setData(emaData.map((d) => ({ time: d.time as Time, value: d.value })))
      }
    }

    // Bollinger Bands
    if (series["bb-upper"] && series["bb-middle"] && series["bb-lower"] && cleanData.length > 20) {
      const bb = calcBollingerBands(cleanData, 20, 2)
      series["bb-upper"].setData(bb.upper.map((d) => ({ time: d.time as Time, value: d.value })))
      series["bb-middle"].setData(bb.middle.map((d) => ({ time: d.time as Time, value: d.value })))
      series["bb-lower"].setData(bb.lower.map((d) => ({ time: d.time as Time, value: d.value })))
    }

    // RSI
    const allTimestamps = cleanData.map((d) => ({ time: d.time as Time, value: 0 }))
    if (series["rsi-anchor"]) series["rsi-anchor"].setData(allTimestamps)
    if (series["rsi"] && cleanData.length > 14) {
      const rsiData = calcRSI(cleanData)
      series["rsi"].setData(rsiData.map((d) => ({ time: d.time as Time, value: d.value })))
      if (series["rsi-70"]) series["rsi-70"].setData(rsiData.map((d) => ({ time: d.time as Time, value: 70 })))
      if (series["rsi-30"]) series["rsi-30"].setData(rsiData.map((d) => ({ time: d.time as Time, value: 30 })))
    }

    // MACD
    if (series["macd-anchor"]) series["macd-anchor"].setData(allTimestamps)
    if (series["macd-line"] && cleanData.length > 26) {
      const macdData = calcMACD(cleanData)
      if (series["macd-line"]) series["macd-line"].setData(macdData.macdLine.map((d) => ({ time: d.time as Time, value: d.value })))
      if (series["macd-signal"]) series["macd-signal"].setData(macdData.signalLine.map((d) => ({ time: d.time as Time, value: d.value })))
      if (series["macd-hist"]) series["macd-hist"].setData(macdData.histogram.map((d) => ({
        time: d.time as Time, value: d.value,
        color: d.value >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
      })))
    }
  }, [])

  // ── Effect 1: Chart lifecycle (create/destroy) ─────────
  // Runs when indicators change. Creates charts + empty series.
  // Populates data from ref, then fitContent.

  useEffect(() => {
    if (!mainChartRef.current) return

    const container = mainChartRef.current

    const chartOptions = {
      layout: {
        textColor: TEXT_COLOR,
        background: { type: ColorType.Solid as const, color: CHART_BG },
        fontFamily: "'Trebuchet MS', Roboto, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID_COLOR },
        horzLines: { color: GRID_COLOR },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR_COLOR, width: 1 as const, style: 3 as const, labelBackgroundColor: "#2a2e39" },
        horzLine: { color: CROSSHAIR_COLOR, width: 1 as const, style: 3 as const, labelBackgroundColor: "#2a2e39" },
      },
      rightPriceScale: {
        borderColor: BORDER_COLOR,
        scaleMargins: { top: 0.05, bottom: 0.05 },
        mode: logScale ? 1 : 0, // 0 = Normal, 1 = Logarithmic
      },
      timeScale: {
        borderColor: BORDER_COLOR,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
      },
      watermark: { visible: false },
      handleScroll: { vertTouchDrag: false },
    }

    const subChartOptions = {
      ...chartOptions,
      height: 130,
      rightPriceScale: { ...chartOptions.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.05 } },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: Record<string, ISeriesApi<any>> = {}

    // ── Main chart ──────────────────────────────────────
    const mainChart = createChart(container, {
      ...chartOptions,
      height: Math.max(400, window.innerHeight - 300),
    })

    series["candle"] = mainChart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderDownColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
    })

    if (indicators.find((i) => i.id === "vol")?.active) {
      series["volume"] = mainChart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      })
      mainChart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      })
    }

    for (const cfg of SMA_CONFIGS) {
      if (indicators.find((i) => i.id === cfg.id)?.active) {
        series[cfg.id] = mainChart.addSeries(LineSeries, {
          color: cfg.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        })
      }
    }

    for (const cfg of EMA_CONFIGS) {
      if (indicators.find((i) => i.id === cfg.id)?.active) {
        series[cfg.id] = mainChart.addSeries(LineSeries, {
          color: cfg.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
        })
      }
    }

    if (indicators.find((i) => i.id === "bb")?.active) {
      series["bb-upper"] = mainChart.addSeries(LineSeries, {
        color: "rgba(33, 150, 243, 0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      })
      series["bb-middle"] = mainChart.addSeries(LineSeries, {
        color: "rgba(33, 150, 243, 0.3)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
      })
      series["bb-lower"] = mainChart.addSeries(LineSeries, {
        color: "rgba(33, 150, 243, 0.5)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      })
    }

    // ── RSI sub-chart ───────────────────────────────────
    let rsiChart: IChartApi | undefined
    if (showRSI && rsiChartRef.current) {
      rsiChart = createChart(rsiChartRef.current, subChartOptions)

      series["rsi-anchor"] = rsiChart.addSeries(LineSeries, {
        color: "transparent", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false,
      })
      series["rsi"] = rsiChart.addSeries(LineSeries, {
        color: "#b39ddb", lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
      })
      series["rsi-70"] = rsiChart.addSeries(LineSeries, {
        color: "rgba(239,83,80,0.3)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
      })
      series["rsi-30"] = rsiChart.addSeries(LineSeries, {
        color: "rgba(38,166,154,0.3)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false,
      })

      // Bidirectional sync
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) rsiChart?.timeScale().setVisibleLogicalRange(range)
      })
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range)
      })
    }

    // ── MACD sub-chart ──────────────────────────────────
    let macdChart: IChartApi | undefined
    if (showMACD && macdChartRef.current) {
      macdChart = createChart(macdChartRef.current, subChartOptions)

      series["macd-anchor"] = macdChart.addSeries(LineSeries, {
        color: "transparent", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, visible: false,
      })
      series["macd-line"] = macdChart.addSeries(LineSeries, {
        color: "#2196f3", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      })
      series["macd-signal"] = macdChart.addSeries(LineSeries, {
        color: "#ff9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      })
      series["macd-hist"] = macdChart.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false,
      })

      // Bidirectional sync
      mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) macdChart?.timeScale().setVisibleLogicalRange(range)
      })
      macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) mainChart.timeScale().setVisibleLogicalRange(range)
      })
    }

    // Store refs
    chartsRef.current = { main: mainChart, rsi: rsiChart ?? null, macd: macdChart ?? null, series }

    // Populate data from ref (covers indicator toggle when data already loaded)
    populateAllSeries()
    mainChart.timeScale().fitContent()
    rsiChart?.timeScale().fitContent()
    macdChart?.timeScale().fitContent()
    // Reset so next data update triggers fitContent too
    lastDataEndRef.current = null

    // ── Crosshair OHLC legend ───────────────────────────

    mainChart.subscribeCrosshairMove((param) => {
      const currentData = filterClean(dataRef.current)
      if (!param.time || !param.seriesData) {
        const last = currentData[currentData.length - 1]
        const prev = currentData.length > 1 ? currentData[currentData.length - 2] : last
        if (last) {
          setLegend({
            time: formatTime(last.time),
            open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume,
            change: last.close - prev.close,
            changePct: prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0,
          })
        }
        return
      }

      const candle = param.seriesData.get(series["candle"]) as CandlestickData | undefined
      const vol = series["volume"] ? param.seriesData.get(series["volume"]) as HistogramData | undefined : undefined

      if (candle) {
        const idx = currentData.findIndex((d) => d.time === (param.time as number))
        const prev = idx > 0 ? currentData[idx - 1] : currentData[idx]
        setLegend({
          time: formatTime(param.time as number),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: vol?.value ?? 0,
          change: candle.close - prev.close,
          changePct: prev.close > 0 ? ((candle.close - prev.close) / prev.close) * 100 : 0,
        })
      }
    })

    // ── Load more on scroll to left edge ────────────────

    let loadMoreEnabled = false
    const loadMoreTimer = setTimeout(() => { loadMoreEnabled = true }, 800)

    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || !loadMoreEnabled || loadMoreCooldownRef.current) return
      if (!onLoadMoreRef.current) return
      const currentData = filterClean(dataRef.current)
      if (currentData.length === 0) return
      if (range.from <= 5) {
        loadMoreCooldownRef.current = true
        setTimeout(() => { loadMoreCooldownRef.current = false }, 1500)
        onLoadMoreRef.current(currentData[0].time)
      }
    })

    // ── Resize observer ─────────────────────────────────

    const allCharts = [mainChart, rsiChart, macdChart].filter(Boolean) as IChartApi[]

    const handleResize = () => {
      const newHeight = Math.max(400, window.innerHeight - 300)
      mainChart.applyOptions({ height: newHeight })
    }
    window.addEventListener("resize", handleResize)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) allCharts.forEach((c) => c.applyOptions({ width: w }))
      }
    })
    resizeObserver.observe(container)

    // ── Right-click context menu for alerts ─────────────
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const y = e.clientY - rect.top
      const price = series["candle"]?.coordinateToPrice(y)
      if (price != null && typeof price === "number" && price > 0) {
        setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, price: Math.round(price * 100) / 100 })
      }
    }
    const handleClick = (e: MouseEvent) => {
      // Don't dismiss if clicking inside the context menu
      const target = e.target as HTMLElement
      if (target.closest("[data-alert-menu]")) return
      setContextMenu(null)
    }
    container.addEventListener("contextmenu", handleContextMenu)
    container.addEventListener("click", handleClick)

    return () => {
      clearTimeout(loadMoreTimer)
      window.removeEventListener("resize", handleResize)
      container.removeEventListener("contextmenu", handleContextMenu)
      container.removeEventListener("click", handleClick)
      resizeObserver.disconnect()
      mainChart.remove()
      rsiChart?.remove()
      macdChart?.remove()
      chartsRef.current = { main: null, rsi: null, macd: null, series: {} }
    }
  }, [indicators, showRSI, showMACD, logScale, populateAllSeries])

  // ── Effect: Draw alert lines on chart ────────────────────
  useEffect(() => {
    const { series } = chartsRef.current
    const candleSeries = series["candle"]
    if (!candleSeries) return

    // Remove existing alert price lines and recreate
    // lightweight-charts doesn't have a removeAllPriceLines, so track them
    // Instead, we store lines on the ref
    if (chartsRef.current.alertLines) {
      for (const line of chartsRef.current.alertLines) {
        try { candleSeries.removePriceLine(line) } catch { /* already removed */ }
      }
    }

    const newLines = alerts.map((a) =>
      candleSeries.createPriceLine({
        price: a.price,
        color: "#ff9800",
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `🔔 $${a.price.toFixed(2)}`,
        axisLabelColor: "#ff9800",
        axisLabelTextColor: "#fff",
      })
    )
    chartsRef.current.alertLines = newLines
  }, [alerts])

  // ── Effect: Update alert overlay positions ───────────────
  useEffect(() => {
    function updateAlertPositions() {
      const { series } = chartsRef.current
      const candleSeries = series["candle"]
      if (!candleSeries || alerts.length === 0) {
        setAlertCoords([])
        return
      }
      const coords = alerts.map((a) => {
        const y = candleSeries.priceToCoordinate(a.price)
        return { id: a.id, price: a.price, y: typeof y === "number" ? y : -999 }
      }).filter((c) => c.y > 0)
      setAlertCoords(coords)
    }

    updateAlertPositions()
    // Update positions periodically while chart is visible (handles zoom/scroll)
    alertUpdateTimerRef.current = setInterval(updateAlertPositions, 300)
    return () => {
      if (alertUpdateTimerRef.current) clearInterval(alertUpdateTimerRef.current)
    }
  }, [alerts])

  // ── Effect 2: Data update (in-place, no chart recreation) ──
  // Runs when data prop changes. Updates series data without touching the chart.
  // fitContent only on fresh loads (last timestamp changed), not on prepends.

  useEffect(() => {
    const { main, rsi, macd } = chartsRef.current
    if (!main) return // chart not created yet

    const cleanData = filterClean(data)
    if (cleanData.length === 0) return

    populateAllSeries()

    // Detect fresh load vs prepend:
    // Fresh load = last candle timestamp changed (new dataset)
    // Prepend = last candle same, earlier candles added
    const currentEnd = cleanData[cleanData.length - 1].time
    const isFreshLoad = lastDataEndRef.current === null || currentEnd !== lastDataEndRef.current
    lastDataEndRef.current = currentEnd

    if (isFreshLoad) {
      main.timeScale().fitContent()
      rsi?.timeScale().fitContent()
      macd?.timeScale().fitContent()
    }
    // On prepend: do nothing to the view — new candles just appear to the left
  }, [data, populateAllSeries])

  // ── Render ───────────────────────────────────────────────

  const isPositive = (legend?.change ?? 0) >= 0

  return (
    <div className="rounded-md overflow-hidden" style={{ background: CHART_BG }}>
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b" style={{ borderColor: BORDER_COLOR }}>
        {/* Interval selector (candle size) */}
        {intervals.map((iv) => (
          <button
            key={iv.interval}
            onClick={() => onPeriodChange(iv.defaultPeriod, iv.interval)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              activeInterval === iv.interval
                ? "bg-[#2962ff] text-white"
                : "text-[#787b86] hover:text-[#d1d4dc]"
            )}
          >
            {iv.label}
          </button>
        ))}

        <div className="w-px h-4 mx-1" style={{ background: BORDER_COLOR }} />

        {/* Indicators button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
            className={cn(
              "px-2 py-1 text-xs font-medium rounded transition-colors",
              showIndicatorMenu ? "bg-[#2962ff] text-white" : "text-[#787b86] hover:text-[#d1d4dc]"
            )}
          >
            Indicators
          </button>

          {showIndicatorMenu && (
            <div
              className="absolute top-full left-0 mt-1 z-50 rounded-md shadow-xl py-1 min-w-[180px]"
              style={{ background: "#1e222d", border: `1px solid ${BORDER_COLOR}` }}
            >
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider" style={{ color: TEXT_COLOR }}>
                Overlays
              </div>
              {indicators.filter((i) => i.overlay).map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-[#2a2e39] transition-colors text-left"
                  style={{ color: ind.active ? "#d1d4dc" : TEXT_COLOR }}
                >
                  <span className={cn("w-3 h-3 rounded-sm border flex items-center justify-center text-[8px]",
                    ind.active ? "bg-[#2962ff] border-[#2962ff]" : "border-[#555]"
                  )}>
                    {ind.active && "✓"}
                  </span>
                  {ind.label}
                </button>
              ))}
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider mt-1" style={{ color: TEXT_COLOR }}>
                Oscillators
              </div>
              {indicators.filter((i) => !i.overlay).map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => toggleIndicator(ind.id)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-[#2a2e39] transition-colors text-left"
                  style={{ color: ind.active ? "#d1d4dc" : TEXT_COLOR }}
                >
                  <span className={cn("w-3 h-3 rounded-sm border flex items-center justify-center text-[8px]",
                    ind.active ? "bg-[#2962ff] border-[#2962ff]" : "border-[#555]"
                  )}>
                    {ind.active && "✓"}
                  </span>
                  {ind.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 mx-1" style={{ background: BORDER_COLOR }} />

        {/* Log scale toggle */}
        <button
          onClick={toggleLogScale}
          className={cn(
            "px-2 py-1 text-xs font-medium rounded transition-colors",
            logScale ? "bg-[#2962ff] text-white" : "text-[#787b86] hover:text-[#d1d4dc]"
          )}
          title="Logarithmic scale"
        >
          Log
        </button>

        {/* Active indicator pills */}
        <div className="flex gap-1 ml-1">
          {indicators.filter((i) => i.active && i.id !== "vol").map((ind) => (
            <span key={ind.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#2a2e39", color: "#787b86" }}>
              {ind.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── OHLC Legend overlay ──────────────────────────── */}
      <div className="relative">
        {legend && (
          <div className="absolute top-2 left-3 z-10 flex items-center gap-3 text-xs pointer-events-none" style={{ fontFamily: "'Trebuchet MS', sans-serif" }}>
            <span className="font-semibold text-[#d1d4dc]">{symbol}</span>
            <span className="text-[#787b86]">{legend.time}</span>
            <span className="text-[#787b86]">O <span style={{ color: isPositive ? UP_COLOR : DOWN_COLOR }}>{legend.open.toFixed(2)}</span></span>
            <span className="text-[#787b86]">H <span style={{ color: isPositive ? UP_COLOR : DOWN_COLOR }}>{legend.high.toFixed(2)}</span></span>
            <span className="text-[#787b86]">L <span style={{ color: isPositive ? UP_COLOR : DOWN_COLOR }}>{legend.low.toFixed(2)}</span></span>
            <span className="text-[#787b86]">C <span style={{ color: isPositive ? UP_COLOR : DOWN_COLOR }}>{legend.close.toFixed(2)}</span></span>
            <span style={{ color: isPositive ? UP_COLOR : DOWN_COLOR }}>
              {isPositive ? "+" : ""}{legend.change.toFixed(2)} ({isPositive ? "+" : ""}{legend.changePct.toFixed(2)}%)
            </span>
            {legend.volume > 0 && (
              <span className="text-[#787b86]">Vol <span className="text-[#d1d4dc]">{formatVol(legend.volume)}</span></span>
            )}
          </div>
        )}

        {/* Main chart */}
        <div ref={mainChartRef} />

        {/* Alert line overlays — hover to reveal delete, drag to move */}
        {alertCoords.map((ac) => {
          const isDragging = draggingAlert?.id === ac.id
          const displayY = isDragging ? draggingAlert.currentY : ac.y
          return (
            <div
              key={ac.id}
              className="absolute right-0 z-20 group flex items-center justify-end pr-14"
              style={{
                top: displayY - 12,
                height: 24,
                left: 0,
                cursor: isDragging ? "grabbing" : "grab",
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return // left click only
                e.preventDefault()
                const startY = e.clientY
                const offsetY = ac.y

                setDraggingAlert({ id: ac.id, startY, currentY: offsetY })

                const onMouseMove = (ev: MouseEvent) => {
                  const newY = offsetY + (ev.clientY - startY)
                  setDraggingAlert({ id: ac.id, startY, currentY: newY })
                }

                const onMouseUp = (ev: MouseEvent) => {
                  document.removeEventListener("mousemove", onMouseMove)
                  document.removeEventListener("mouseup", onMouseUp)
                  const finalY = offsetY + (ev.clientY - startY)
                  // Convert y back to price
                  const { series } = chartsRef.current
                  const candleSeries = series["candle"]
                  if (candleSeries && onMoveAlert) {
                    const newPrice = candleSeries.coordinateToPrice(finalY)
                    if (typeof newPrice === "number" && newPrice > 0) {
                      onMoveAlert(ac.id, Math.round(newPrice * 100) / 100)
                    }
                  }
                  setDraggingAlert(null)
                }

                document.addEventListener("mousemove", onMouseMove)
                document.addEventListener("mouseup", onMouseUp)
              }}
            >
              {isDragging && (
                <span className="text-[10px] font-mono mr-2" style={{ color: "#ff9800" }}>
                  ${(chartsRef.current.series["candle"]?.coordinateToPrice(displayY) ?? 0).toFixed(2)}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveAlert?.(ac.id)
                  setToast(`Alert removed`)
                  setTimeout(() => setToast(null), 2000)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer"
                style={{ background: "#ef5350", color: "#fff" }}
                title={`Remove alert at $${ac.price.toFixed(2)}`}
              >
                ✕
              </button>
            </div>
          )
        })}

        {/* Toast notification */}
        {toast && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md text-xs font-medium"
            style={{ background: "#ff9800", color: "#000" }}
          >
            {toast}
          </div>
        )}
      </div>

      {/* RSI sub-chart */}
      {showRSI && (
        <div className="relative">
          <div className="absolute top-1 left-3 z-10 text-[10px] pointer-events-none" style={{ color: "#b39ddb" }}>
            RSI(14)
          </div>
          <div ref={rsiChartRef} style={{ borderTop: `1px solid ${BORDER_COLOR}` }} />
        </div>
      )}

      {/* MACD sub-chart */}
      {showMACD && (
        <div className="relative">
          <div className="absolute top-1 left-3 z-10 text-[10px] pointer-events-none flex gap-3">
            <span style={{ color: "#2196f3" }}>MACD(12,26,9)</span>
            <span style={{ color: "#ff9800" }}>Signal</span>
          </div>
          <div ref={macdChartRef} style={{ borderTop: `1px solid ${BORDER_COLOR}` }} />
        </div>
      )}

      {/* Right-click context menu — rendered outside chart canvas to avoid z-index issues */}
      {contextMenu && onCreateAlert && (
        <div
          data-alert-menu
          className="fixed rounded-md shadow-xl py-1 min-w-[200px]"
          style={{
            left: (mainChartRef.current?.getBoundingClientRect().left ?? 0) + contextMenu.x,
            top: (mainChartRef.current?.getBoundingClientRect().top ?? 0) + contextMenu.y,
            zIndex: 9999,
            background: "#1e222d",
            border: `1px solid ${BORDER_COLOR}`,
          }}
        >
          <button
            onClick={() => {
              onCreateAlert(symbol, contextMenu.price, contextMenu.price > (legend?.close ?? 0) ? "above" : "below")
              setContextMenu(null)
              setToast(`Alert set at $${contextMenu.price.toFixed(2)}`)
              setTimeout(() => setToast(null), 2000)
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-[#2a2e39] transition-colors text-left cursor-pointer"
            style={{ color: "#d1d4dc" }}
          >
            <span className="text-sm">🔔</span>
            Add alert at ${contextMenu.price.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  )
}

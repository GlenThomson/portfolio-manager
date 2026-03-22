"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { IChartApi, Time } from "lightweight-charts"
import { Button } from "@/components/ui/button"
import { TickerSearch } from "@/components/ui/ticker-search"
import { Plus, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Quote, OHLC } from "@/types/market"

// ── Constants ─────────────────────────────────────────────

const MAX_SYMBOLS = 10

const LINE_COLORS = [
  "#2962ff", "#26a69a", "#ef5350", "#ff9800",
  "#ab47bc", "#42a5f5", "#66bb6a", "#ffa726",
  "#ec407a", "#78909c",
]

const CHART_BG = "#131722"
const GRID_COLOR = "#1e222d"
const TEXT_COLOR = "#787b86"
const BORDER_COLOR = "#2a2e39"
const CROSSHAIR_COLOR = "#555"

const PERIODS = [
  { label: "1M", period: "1mo" },
  { label: "3M", period: "3mo" },
  { label: "6M", period: "6mo" },
  { label: "1Y", period: "1y" },
]

// ── Helpers ───────────────────────────────────────────────

function formatNum(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function formatVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

function normalizeToPercent(data: OHLC[]): { time: number; value: number }[] {
  if (data.length === 0) return []
  const basePrice = data[0].close
  if (basePrice === 0) return []
  return data.map((d) => ({
    time: d.time,
    value: ((d.close - basePrice) / basePrice) * 100,
  }))
}

// ── Comparison metrics table rows ─────────────────────────

interface MetricRow {
  label: string
  getValue: (q: Quote) => string
  getRaw: (q: Quote) => number | null
  higherIsBetter: boolean
}

const METRIC_ROWS: MetricRow[] = [
  {
    label: "Price",
    getValue: (q) => `$${q.regularMarketPrice.toFixed(2)}`,
    getRaw: (q) => q.regularMarketPrice,
    higherIsBetter: true,
  },
  {
    label: "Day Change %",
    getValue: (q) => `${q.regularMarketChangePercent >= 0 ? "+" : ""}${q.regularMarketChangePercent.toFixed(2)}%`,
    getRaw: (q) => q.regularMarketChangePercent,
    higherIsBetter: true,
  },
  {
    label: "Market Cap",
    getValue: (q) => formatNum(q.marketCap),
    getRaw: (q) => q.marketCap,
    higherIsBetter: true,
  },
  {
    label: "P/E Ratio",
    getValue: (q) => q.trailingPE != null ? q.trailingPE.toFixed(2) : "N/A",
    getRaw: (q) => q.trailingPE,
    higherIsBetter: false,
  },
  {
    label: "EPS",
    getValue: (q) => q.epsTrailingTwelveMonths != null ? `$${q.epsTrailingTwelveMonths.toFixed(2)}` : "N/A",
    getRaw: (q) => q.epsTrailingTwelveMonths,
    higherIsBetter: true,
  },
  {
    label: "Dividend Yield",
    getValue: (q) => q.dividendYield != null ? `${q.dividendYield.toFixed(2)}%` : "N/A",
    getRaw: (q) => q.dividendYield,
    higherIsBetter: true,
  },
  {
    label: "52W High",
    getValue: (q) => `$${q.fiftyTwoWeekHigh.toFixed(2)}`,
    getRaw: (q) => q.fiftyTwoWeekHigh,
    higherIsBetter: true,
  },
  {
    label: "52W Low",
    getValue: (q) => `$${q.fiftyTwoWeekLow.toFixed(2)}`,
    getRaw: (q) => q.fiftyTwoWeekLow,
    higherIsBetter: false,
  },
  {
    label: "Volume",
    getValue: (q) => formatVol(q.regularMarketVolume),
    getRaw: (q) => q.regularMarketVolume,
    higherIsBetter: true,
  },
  {
    label: "Beta",
    getValue: (q) => q.beta != null ? q.beta.toFixed(2) : "N/A",
    getRaw: (q) => q.beta,
    higherIsBetter: false,
  },
]

// ── Component ─────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Parse symbols from URL
  const urlSymbols = useMemo(() => {
    const raw = searchParams.get("symbols") ?? ""
    return raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, MAX_SYMBOLS)
  }, [searchParams])

  const [inputValues, setInputValues] = useState<string[]>(() => {
    const syms = [...urlSymbols]
    while (syms.length < 2) syms.push("")
    return syms
  })
  const [activeSymbols, setActiveSymbols] = useState<string[]>(urlSymbols)
  const [activePeriod, setActivePeriod] = useState("6mo")
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [chartDataMap, setChartDataMap] = useState<Record<string, OHLC[]>>({})
  const [loading, setLoading] = useState(false)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  // Sync URL when activeSymbols change
  useEffect(() => {
    if (activeSymbols.length > 0) {
      const params = new URLSearchParams()
      params.set("symbols", activeSymbols.join(","))
      router.replace(`/compare?${params.toString()}`, { scroll: false })
    }
  }, [activeSymbols, router])

  // Fetch quotes for active symbols
  useEffect(() => {
    if (activeSymbols.length === 0) return
    fetch(`/api/market/quote?symbols=${activeSymbols.join(",")}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const map: Record<string, Quote> = {}
        if (activeSymbols.length === 1) {
          map[data.symbol] = data
        } else {
          for (const q of data) {
            map[q.symbol] = q
          }
        }
        setQuotes(map)
      })
      .catch(() => {})
  }, [activeSymbols])

  // Fetch chart data for all active symbols whenever symbols or period changes
  useEffect(() => {
    if (activeSymbols.length === 0) return
    setLoading(true)

    Promise.all(
      activeSymbols.map((sym) =>
        fetch(`/api/market/chart?symbol=${sym}&period=${activePeriod}&interval=1d`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data: OHLC[]) => ({ sym, data }))
          .catch(() => ({ sym, data: [] as OHLC[] }))
      )
    ).then((results) => {
      const map: Record<string, OHLC[]> = {}
      for (const { sym, data } of results) {
        map[sym] = data.filter((d: OHLC) => d.close > 0)
      }
      setChartDataMap(map)
      setLoading(false)
    })
  }, [activeSymbols, activePeriod])

  // Render chart using lightweight-charts
  useEffect(() => {
    if (!chartContainerRef.current) return
    if (activeSymbols.length === 0) return
    if (Object.keys(chartDataMap).length === 0) return

    // Clean up old chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const container = chartContainerRef.current

    let cancelled = false

    import("lightweight-charts").then(({ createChart, ColorType, CrosshairMode, LineSeries }) => {
      if (cancelled) return

      const chart = createChart(container, {
        height: 450,
        layout: {
          textColor: TEXT_COLOR,
          background: { type: ColorType.Solid, color: CHART_BG },
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
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: BORDER_COLOR,
          timeVisible: false,
          rightOffset: 5,
          barSpacing: 6,
        },
      })

      chartRef.current = chart

      // Add a line series for each symbol
      activeSymbols.forEach((sym, idx) => {
        const rawData = chartDataMap[sym]
        if (!rawData || rawData.length === 0) return

        const normalized = normalizeToPercent(rawData)
        if (normalized.length === 0) return

        const series = chart.addSeries(LineSeries, {
          color: LINE_COLORS[idx % LINE_COLORS.length],
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: sym,
          priceFormat: {
            type: "custom",
            formatter: (price: number) => `${price >= 0 ? "+" : ""}${price.toFixed(2)}%`,
          },
        })

        series.setData(
          normalized.map((d) => ({ time: d.time as Time, value: d.value }))
        )
      })

      chart.timeScale().fitContent()

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width
          if (w > 0) chart.applyOptions({ width: w })
        }
      })
      resizeObserver.observe(container)
    })

    return () => {
      cancelled = true
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [chartDataMap, activeSymbols])

  // ── Handlers ──────────────────────────────────────────────

  const handleCompare = useCallback(() => {
    const syms = inputValues
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const unique = Array.from(new Set(syms)).slice(0, MAX_SYMBOLS)
    if (unique.length === 0) return
    setActiveSymbols(unique)
  }, [inputValues])

  const handleInputChange = useCallback((index: number, value: string) => {
    setInputValues((prev) => {
      const next = [...prev]
      next[index] = value.toUpperCase()
      return next
    })
  }, [])

  const handleSelectSymbol = useCallback((index: number, symbol: string) => {
    setInputValues((prev) => {
      const next = [...prev]
      next[index] = symbol
      return next
    })
  }, [])

  const handleAddField = useCallback(() => {
    if (inputValues.length >= MAX_SYMBOLS) return
    setInputValues((prev) => [...prev, ""])
  }, [inputValues.length])

  const handleRemoveField = useCallback((index: number) => {
    if (inputValues.length <= 2) return
    setInputValues((prev) => prev.filter((_, i) => i !== index))
  }, [inputValues.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleCompare()
    },
    [handleCompare]
  )

  // ── Metric highlighting ────────────────────────────────────

  function getBestWorst(row: MetricRow) {
    const values = activeSymbols.map((sym) => {
      const q = quotes[sym]
      return q ? row.getRaw(q) : null
    })

    const validValues = values.filter((v): v is number => v != null)
    if (validValues.length < 2) return { best: -1, worst: -1 }

    const best = row.higherIsBetter ? Math.max(...validValues) : Math.min(...validValues)
    const worst = row.higherIsBetter ? Math.min(...validValues) : Math.max(...validValues)

    return {
      best: values.indexOf(best),
      worst: values.indexOf(worst),
    }
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Compare Stocks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare up to {MAX_SYMBOLS} stocks side by side with normalized price charts and key metrics.
        </p>
      </div>

      {/* ── Symbol Inputs ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        {inputValues.map((val, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Stock {idx + 1}
              </label>
              <div className="flex items-center gap-1">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                />
                <TickerSearch
                  value={val}
                  onChange={(v) => handleInputChange(idx, v)}
                  onSelect={(sym) => handleSelectSymbol(idx, sym)}
                  onKeyDown={handleKeyDown}
                  placeholder="SYMBOL"
                  inputClassName="w-28 h-8 text-sm uppercase"
                />
                {inputValues.length > 2 && (
                  <button
                    onClick={() => handleRemoveField(idx)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {inputValues.length < MAX_SYMBOLS && (
          <Button variant="outline" size="sm" onClick={handleAddField} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}

        <Button size="sm" onClick={handleCompare} className="h-8">
          Compare
        </Button>
      </div>

      {/* ── Normalized Price Chart ────────────────────────── */}
      {activeSymbols.length > 0 && (
        <div className="rounded-md overflow-hidden" style={{ background: CHART_BG }}>
          {/* Period selector toolbar */}
          <div
            className="flex items-center gap-1 px-3 py-1.5 border-b flex-wrap"
            style={{ borderColor: BORDER_COLOR }}
          >
            <span className="text-xs font-medium mr-2" style={{ color: TEXT_COLOR }}>
              Normalized % Change
            </span>
            {PERIODS.map((p) => (
              <button
                key={p.period}
                onClick={() => setActivePeriod(p.period)}
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded transition-colors",
                  activePeriod === p.period
                    ? "bg-[#2962ff] text-white"
                    : "text-[#787b86] hover:text-[#d1d4dc]"
                )}
              >
                {p.label}
              </button>
            ))}

            {/* Legend */}
            <div className="flex items-center gap-3 ml-auto flex-wrap">
              {activeSymbols.map((sym, idx) => (
                <div key={sym} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-0.5 rounded"
                    style={{ backgroundColor: LINE_COLORS[idx % LINE_COLORS.length] }}
                  />
                  <span className="text-xs" style={{ color: LINE_COLORS[idx % LINE_COLORS.length] }}>
                    {sym}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 450 }}
            >
              <Loader2 className="h-6 w-6 animate-spin text-[#787b86]" />
            </div>
          ) : (
            <div ref={chartContainerRef} />
          )}
        </div>
      )}

      {/* ── Comparison Table ──────────────────────────────── */}
      {activeSymbols.length > 0 && Object.keys(quotes).length > 0 && (
        <div className="rounded-md overflow-hidden" style={{ background: CHART_BG }}>
          <div
            className="px-3 py-2 border-b text-xs font-medium"
            style={{ borderColor: BORDER_COLOR, color: TEXT_COLOR }}
          >
            Key Metrics Comparison
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}>
                  <th
                    className="text-left px-4 py-2.5 text-xs font-medium sticky left-0"
                    style={{ color: TEXT_COLOR, background: CHART_BG }}
                  >
                    Metric
                  </th>
                  {activeSymbols.map((sym, idx) => (
                    <th
                      key={sym}
                      className="text-right px-4 py-2.5 text-xs font-medium"
                      style={{ color: LINE_COLORS[idx % LINE_COLORS.length] }}
                    >
                      {sym}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => {
                  const { best, worst } = getBestWorst(row)
                  return (
                    <tr
                      key={row.label}
                      style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
                      className="hover:bg-[#1e222d] transition-colors"
                    >
                      <td
                        className="px-4 py-2.5 text-xs sticky left-0"
                        style={{ color: TEXT_COLOR, background: CHART_BG }}
                      >
                        {row.label}
                      </td>
                      {activeSymbols.map((sym, idx) => {
                        const q = quotes[sym]
                        if (!q) {
                          return (
                            <td
                              key={sym}
                              className="text-right px-4 py-2.5 text-xs"
                              style={{ color: "#d1d4dc" }}
                            >
                              --
                            </td>
                          )
                        }
                        const isBest = idx === best
                        const isWorst = idx === worst
                        return (
                          <td
                            key={sym}
                            className="text-right px-4 py-2.5 text-xs font-medium"
                            style={{
                              color: isBest
                                ? "#26a69a"
                                : isWorst
                                ? "#ef5350"
                                : "#d1d4dc",
                            }}
                          >
                            {row.getValue(q)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {activeSymbols.length === 0 && (
        <div
          className="rounded-md flex flex-col items-center justify-center py-20"
          style={{ background: CHART_BG }}
        >
          <p className="text-sm" style={{ color: TEXT_COLOR }}>
            Enter stock symbols above and click Compare to get started.
          </p>
        </div>
      )}
    </div>
  )
}

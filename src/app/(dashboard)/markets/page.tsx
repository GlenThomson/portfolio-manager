"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ArrowUpDown,
  RefreshCw,
  CalendarDays,
} from "lucide-react"
import { EarningsCalendar } from "@/components/market/earnings-calendar"
import { Button } from "@/components/ui/button"

// --- Fear & Greed ---
interface FearGreedHistoryPoint {
  date: number
  score: number
  rating: string
}

interface FearGreedData {
  score: number
  rating: string
  previousClose: number
  previous1Week: number
  previous1Month: number
  previous1Year: number
  history: FearGreedHistoryPoint[]
}

const FG_RANGES = ["1m", "3m", "6m", "1y", "2y", "5y"] as const

function scoreColor(score: number): string {
  if (score <= 25) return "#ea3943"
  if (score <= 45) return "#ea8c00"
  if (score <= 55) return "#9ca3af"
  if (score <= 75) return "#30d5c8"
  return "#16c784"
}

function ratingColor(rating: string): string {
  if (rating.includes("extreme fear")) return "#ea3943"
  if (rating.includes("fear")) return "#ea8c00"
  if (rating.includes("neutral")) return "#9ca3af"
  if (rating.includes("extreme greed")) return "#16c784"
  if (rating.includes("greed")) return "#30d5c8"
  return "#9ca3af"
}

function FearGreedSection({
  data,
  range,
  onRangeChange,
}: {
  data: FearGreedData | null
  range: string
  onRangeChange: (r: string) => void
}) {
  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="h-48 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const color = ratingColor(data.rating)

  // Gauge: semicircle, center bottom, arcs curving upward
  const R = 80
  const CX = 100
  const CY = 92
  // Point on the semicircle: pct 0=left, 1=right
  const arcPoint = (pct: number) => {
    const angle = Math.PI * (1 - pct)
    return {
      x: CX + R * Math.cos(angle),
      y: CY - R * Math.sin(angle),
    }
  }

  const needlePct = data.score / 100
  const needleEnd = arcPoint(needlePct)

  const zones = [
    { from: 0, to: 0.25, color: "#ea3943" },
    { from: 0.25, to: 0.45, color: "#ea8c00" },
    { from: 0.45, to: 0.55, color: "#9ca3af" },
    { from: 0.55, to: 0.75, color: "#30d5c8" },
    { from: 0.75, to: 1, color: "#16c784" },
  ]

  // Build arc path between two percentages (sweep upward)
  const makeArc = (fromPct: number, toPct: number) => {
    const start = arcPoint(fromPct)
    const end = arcPoint(toPct)
    const largeArc = toPct - fromPct > 0.5 ? 1 : 0
    // sweep=1 for clockwise in SVG (visually curving upward)
    return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  // History chart
  const history = data.history ?? []
  const chartW = 400
  const chartH = 140
  const chartPad = 6
  const innerH = chartH - chartPad * 2
  const innerW = chartW - chartPad * 2

  let historyPath = ""
  let historyAreaPath = ""
  if (history.length > 1) {
    const minDate = history[0].date
    const maxDate = history[history.length - 1].date
    const dateRange = maxDate - minDate || 1

    const points = history.map((p) => ({
      x: chartPad + ((p.date - minDate) / dateRange) * innerW,
      y: chartPad + (1 - p.score / 100) * innerH,
    }))

    historyPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    historyAreaPath = historyPath + ` L ${points[points.length - 1].x} ${chartH - chartPad} L ${points[0].x} ${chartH - chartPad} Z`
  }

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: range !== "1m" && range !== "3m" ? "2-digit" : undefined })

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Left: Gauge */}
          <div className="flex flex-col items-center">
            <div className="w-56 h-32">
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
                  stroke={color} strokeWidth="2.5" strokeLinecap="round"
                />
                <circle cx={CX} cy={CY} r="4" fill={color} />
                {/* Labels */}
                <text x="14" y="102" fontSize="9" fill="#787b86" textAnchor="start">0</text>
                <text x="100" y="8" fontSize="9" fill="#787b86" textAnchor="middle">50</text>
                <text x="186" y="102" fontSize="9" fill="#787b86" textAnchor="end">100</text>
              </svg>
            </div>
            {/* Score text */}
            <div className="text-center -mt-2">
              <span className="text-4xl font-bold" style={{ color }}>{Math.round(data.score)}</span>
              <p className="text-base font-semibold capitalize mt-0.5" style={{ color }}>{data.rating}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">CNN Fear & Greed Index</p>
            {/* Previous values */}
            <div className="flex gap-5 mt-3">
              {[
                { label: "1W ago", val: data.previous1Week },
                { label: "1M ago", val: data.previous1Month },
                { label: "1Y ago", val: data.previous1Year },
              ].map((p) => (
                <div key={p.label} className="text-center">
                  <p className="text-[11px] text-muted-foreground">{p.label}</p>
                  <p className="text-sm font-bold" style={{ color: scoreColor(p.val) }}>
                    {Math.round(p.val)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: History chart */}
          {history.length > 1 && (
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">Historical</p>
                <div className="flex gap-1">
                  {FG_RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => onRangeChange(r)}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded font-medium transition-colors",
                        range === r
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full relative" style={{ height: "220px" }}>
                {/* Chart SVG — stretched to fill, no text inside */}
                <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" className="absolute inset-0" style={{ width: "calc(100% - 28px)", height: "100%" }}>
                  {/* Zone bands */}
                  {[
                    { from: 75, to: 100, color: "#16c784" },
                    { from: 55, to: 75, color: "#30d5c8" },
                    { from: 45, to: 55, color: "#9ca3af" },
                    { from: 25, to: 45, color: "#ea8c00" },
                    { from: 0, to: 25, color: "#ea3943" },
                  ].map((band) => (
                    <rect
                      key={band.from}
                      x="0"
                      y={chartPad + (1 - band.to / 100) * innerH}
                      width={chartW}
                      height={((band.to - band.from) / 100) * innerH}
                      fill={band.color}
                      opacity="0.06"
                    />
                  ))}
                  {/* Threshold lines */}
                  {[25, 50, 75].map((v) => (
                    <line
                      key={v}
                      x1="0" x2={chartW}
                      y1={chartPad + (1 - v / 100) * innerH}
                      y2={chartPad + (1 - v / 100) * innerH}
                      stroke="#787b86" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.3"
                    />
                  ))}
                  {/* Area fill */}
                  <path d={historyAreaPath} fill="url(#fgGrad)" opacity="0.2" />
                  {/* Line */}
                  <path d={historyPath} fill="none" stroke={color} strokeWidth="1" />
                  <defs>
                    <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                      <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
                {/* Y-axis labels as HTML so they don't stretch */}
                <div className="absolute top-0 right-0 h-full flex flex-col justify-between py-1" style={{ width: "28px" }}>
                  {[100, 75, 50, 25, 0].map((v) => (
                    <span key={v} className="text-[11px] text-muted-foreground leading-none text-right pr-1">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-1">
                <span>{formatDate(history[0].date)}</span>
                <span>{formatDate(history[history.length - 1].date)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Types ---
interface ScanResult {
  symbol: string
  shortName: string
  price: number
  change: number
  changePercent: number
  volume: number
  averageVolume: number
  marketCap: number
}

interface SectorResult {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
}

interface FiftyTwoWeekResult {
  symbol: string
  shortName: string
  price: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  distanceFromHigh: number
  distanceFromLow: number
  nearHigh: boolean
  nearLow: boolean
}

// --- Formatting helpers ---
function formatNumber(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`
}

function ChangeCell({ change, changePercent }: { change: number; changePercent: number }) {
  const isPositive = change >= 0
  return (
    <div className={cn("flex items-center gap-1", isPositive ? "text-green-500" : "text-red-500")}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <span>
        {isPositive ? "+" : ""}
        {change.toFixed(2)} ({isPositive ? "+" : ""}
        {changePercent.toFixed(2)}%)
      </span>
    </div>
  )
}

function SymbolLink({ symbol, shortName }: { symbol: string; shortName: string }) {
  return (
    <Link href={`/stock/${symbol}`} className="group">
      <span className="font-bold text-primary group-hover:underline">{symbol}</span>
      <span className="block text-xs text-muted-foreground truncate max-w-[160px]">
        {shortName}
      </span>
    </Link>
  )
}

// --- Sub-components for each tab ---

function GainersLosersTable({
  data,
  loading,
}: {
  data: ScanResult[]
  loading: boolean
}) {
  if (loading) return <TableSkeleton rows={10} cols={6} />
  if (data.length === 0) return <EmptyState message="No data available" />

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Volume</TableHead>
          <TableHead className="text-right hidden md:table-cell">Market Cap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.symbol}>
            <TableCell>
              <SymbolLink symbol={item.symbol} shortName={item.shortName} />
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatPrice(item.price)}
            </TableCell>
            <TableCell className="text-right">
              <ChangeCell change={item.change} changePercent={item.changePercent} />
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
              {formatNumber(item.volume)}
            </TableCell>
            <TableCell className="text-right hidden md:table-cell text-muted-foreground">
              {formatNumber(item.marketCap)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function VolumeTable({
  data,
  loading,
}: {
  data: ScanResult[]
  loading: boolean
}) {
  if (loading) return <TableSkeleton rows={10} cols={6} />
  if (data.length === 0) return <EmptyState message="No unusual volume detected" />

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right hidden sm:table-cell">Volume</TableHead>
          <TableHead className="text-right hidden md:table-cell">Avg Volume</TableHead>
          <TableHead className="text-right hidden md:table-cell">Vol Ratio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => {
          const ratio =
            item.averageVolume > 0
              ? (item.volume / item.averageVolume).toFixed(1)
              : "N/A"
          return (
            <TableRow key={item.symbol}>
              <TableCell>
                <SymbolLink symbol={item.symbol} shortName={item.shortName} />
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatPrice(item.price)}
              </TableCell>
              <TableCell className="text-right">
                <ChangeCell change={item.change} changePercent={item.changePercent} />
              </TableCell>
              <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                {formatNumber(item.volume)}
              </TableCell>
              <TableCell className="text-right hidden md:table-cell text-muted-foreground">
                {formatNumber(item.averageVolume)}
              </TableCell>
              <TableCell className="text-right hidden md:table-cell">
                <Badge variant={Number(ratio) >= 3 ? "destructive" : "secondary"}>
                  {ratio}x
                </Badge>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function SectorsTable({
  data,
  loading,
}: {
  data: SectorResult[]
  loading: boolean
}) {
  if (loading) return <TableSkeleton rows={11} cols={4} />
  if (data.length === 0) return <EmptyState message="No sector data available" />

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sector</TableHead>
            <TableHead>ETF</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.symbol}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell>
                <Link
                  href={`/stock/${item.symbol}`}
                  className="text-primary hover:underline font-bold"
                >
                  {item.symbol}
                </Link>
              </TableCell>
              <TableCell className="text-right">{formatPrice(item.price)}</TableCell>
              <TableCell className="text-right">
                <ChangeCell change={item.change} changePercent={item.changePercent} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Visual bar chart of sector performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Sector Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.map((item) => {
            const maxAbs = Math.max(...data.map((d) => Math.abs(d.changePercent)), 0.01)
            const width = Math.abs(item.changePercent) / maxAbs
            const isPositive = item.changePercent >= 0
            return (
              <div key={item.symbol} className="flex items-center gap-3">
                <span className="text-xs font-medium w-32 truncate">{item.name}</span>
                <div className="flex-1 flex items-center">
                  {isPositive ? (
                    <div
                      className="h-5 rounded-r bg-green-500/30 border border-green-500/50"
                      style={{ width: `${width * 100}%`, minWidth: "2px" }}
                    />
                  ) : (
                    <div className="flex-1 flex justify-end">
                      <div
                        className="h-5 rounded-l bg-red-500/30 border border-red-500/50"
                        style={{ width: `${width * 100}%`, minWidth: "2px" }}
                      />
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium w-16 text-right",
                    isPositive ? "text-green-500" : "text-red-500"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {item.changePercent.toFixed(2)}%
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function FiftyTwoWeekTable({
  data,
  loading,
}: {
  data: FiftyTwoWeekResult[]
  loading: boolean
}) {
  if (loading) return <TableSkeleton rows={10} cols={6} />
  if (data.length === 0)
    return <EmptyState message="No stocks near 52-week extremes" />

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right hidden sm:table-cell">52W High</TableHead>
          <TableHead className="text-right hidden sm:table-cell">52W Low</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.symbol}>
            <TableCell>
              <SymbolLink symbol={item.symbol} shortName={item.shortName} />
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatPrice(item.price)}
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
              {formatPrice(item.fiftyTwoWeekHigh)}
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
              {formatPrice(item.fiftyTwoWeekLow)}
            </TableCell>
            <TableCell className="text-right">
              {item.nearHigh && (
                <Badge className="bg-green-500/20 text-green-500 border-green-500/50">
                  Near High ({item.distanceFromHigh.toFixed(1)}% away)
                </Badge>
              )}
              {item.nearLow && (
                <Badge className="bg-red-500/20 text-red-500 border-red-500/50">
                  Near Low ({item.distanceFromLow.toFixed(1)}% above)
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-8 bg-muted animate-pulse rounded flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 opacity-50" />
      <p>{message}</p>
    </div>
  )
}

// --- Main page ---
export default function MarketsPage() {
  const [activeTab, setActiveTab] = useState("gainers")
  const [fearGreed, setFearGreed] = useState<FearGreedData | null>(null)
  const [fgRange, setFgRange] = useState("1y")
  const [gainers, setGainers] = useState<ScanResult[]>([])
  const [losers, setLosers] = useState<ScanResult[]>([])
  const [volume, setVolume] = useState<ScanResult[]>([])
  const [sectors, setSectors] = useState<SectorResult[]>([])
  const [fiftyTwoWeek, setFiftyTwoWeek] = useState<FiftyTwoWeekResult[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({
    gainers: true,
    losers: true,
    volume: true,
    sectors: true,
    "52week": true,
  })

  const fetchData = useCallback(async (type: string) => {
    setLoading((prev) => ({ ...prev, [type]: true }))
    try {
      const res = await fetch(`/api/market/scanner?type=${type}&count=15`)
      const data = await res.json()
      switch (type) {
        case "gainers":
          setGainers(data)
          break
        case "losers":
          setLosers(data)
          break
        case "volume":
          setVolume(data)
          break
        case "sectors":
          setSectors(data)
          break
        case "52week":
          setFiftyTwoWeek(data)
          break
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} data:`, error)
    } finally {
      setLoading((prev) => ({ ...prev, [type]: false }))
    }
  }, [])

  // Fetch active tab on mount and tab change
  useEffect(() => {
    fetchData(activeTab)
  }, [activeTab, fetchData])

  // Also eagerly load sectors since they're lightweight
  useEffect(() => {
    fetchData("sectors")
  }, [fetchData])

  // Fetch Fear & Greed
  useEffect(() => {
    setFearGreed(null)
    fetch(`/api/market/fear-greed?range=${fgRange}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setFearGreed(d) })
      .catch(() => {})
  }, [fgRange])

  const handleRefresh = () => {
    fetchData(activeTab)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Market Scanner</h1>
          <p className="text-muted-foreground">
            Scan for unusual activity and opportunities
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <FearGreedSection data={fearGreed} range={fgRange} onRangeChange={setFgRange} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="gainers" className="gap-1">
            <TrendingUp className="h-3 w-3 hidden sm:inline" />
            Gainers
          </TabsTrigger>
          <TabsTrigger value="losers" className="gap-1">
            <TrendingDown className="h-3 w-3 hidden sm:inline" />
            Losers
          </TabsTrigger>
          <TabsTrigger value="volume" className="gap-1">
            <Activity className="h-3 w-3 hidden sm:inline" />
            Volume
          </TabsTrigger>
          <TabsTrigger value="sectors" className="gap-1">
            <BarChart3 className="h-3 w-3 hidden sm:inline" />
            Sectors
          </TabsTrigger>
          <TabsTrigger value="52week" className="gap-1">
            <ArrowUpDown className="h-3 w-3 hidden sm:inline" />
            52W H/L
          </TabsTrigger>
          <TabsTrigger value="earnings" className="gap-1">
            <CalendarDays className="h-3 w-3 hidden sm:inline" />
            Earnings
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <TabsContent value="gainers">
              <GainersLosersTable data={gainers} loading={loading.gainers} />
            </TabsContent>

            <TabsContent value="losers">
              <GainersLosersTable data={losers} loading={loading.losers} />
            </TabsContent>

            <TabsContent value="volume">
              <VolumeTable data={volume} loading={loading.volume} />
            </TabsContent>

            <TabsContent value="sectors">
              <SectorsTable data={sectors} loading={loading.sectors} />
            </TabsContent>

            <TabsContent value="52week">
              <FiftyTwoWeekTable
                data={fiftyTwoWeek}
                loading={loading["52week"]}
              />
            </TabsContent>

            <TabsContent value="earnings">
              <EarningsCalendar />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}

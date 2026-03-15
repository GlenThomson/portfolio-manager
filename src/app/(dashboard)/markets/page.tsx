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
} from "lucide-react"
import { Button } from "@/components/ui/button"

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
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
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}

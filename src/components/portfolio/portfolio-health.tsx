"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface PortfolioHealthReport {
  overallScore: number
  grade: string
  sectorAllocation: { sector: string; weight: number; count: number }[]
  sectorConcentrationScore: number
  topHoldings: { symbol: string; weight: number }[]
  concentrationWarnings: string[]
  portfolioBeta: number
  highBetaExposure: number
  numberOfPositions: number
  diversificationScore: number
  suggestions: string[]
}

const SECTOR_COLORS: Record<string, string> = {
  Technology: "#3b82f6",
  Healthcare: "#10b981",
  "Financial Services": "#f59e0b",
  "Consumer Cyclical": "#8b5cf6",
  "Consumer Defensive": "#06b6d4",
  "Consumer Staples": "#06b6d4",
  "Communication Services": "#ec4899",
  Industrials: "#6366f1",
  Energy: "#ef4444",
  Utilities: "#14b8a6",
  "Real Estate": "#f97316",
  "Basic Materials": "#84cc16",
  Unknown: "#6b7280",
}

function getGradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-green-400"
  if (grade.startsWith("B")) return "text-blue-400"
  if (grade.startsWith("C")) return "text-yellow-400"
  if (grade.startsWith("D")) return "text-orange-400"
  return "text-red-400"
}

function getGradeBgColor(grade: string): string {
  if (grade.startsWith("A")) return "bg-green-500/10 border-green-500/30"
  if (grade.startsWith("B")) return "bg-blue-500/10 border-blue-500/30"
  if (grade.startsWith("C")) return "bg-yellow-500/10 border-yellow-500/30"
  if (grade.startsWith("D")) return "bg-orange-500/10 border-orange-500/30"
  return "bg-red-500/10 border-red-500/30"
}

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? SECTOR_COLORS.Unknown
}

export function PortfolioHealth({ portfolioId }: { portfolioId: string }) {
  const [report, setReport] = useState<PortfolioHealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function fetchHealth() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/portfolio/${portfolioId}/health`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? "Failed to load health report")
        }
        const data = await res.json()
        setReport(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load")
      } finally {
        setLoading(false)
      }
    }
    fetchHealth()
  }, [portfolioId])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              Analyzing portfolio health...
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!report || report.numberOfPositions === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Portfolio Health
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 px-2"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Grade + Score row */}
        <div className="flex items-center gap-4 mb-4">
          <div
            className={`flex items-center justify-center w-16 h-16 rounded-lg border-2 ${getGradeBgColor(report.grade)}`}
          >
            <span className={`text-3xl font-bold ${getGradeColor(report.grade)}`}>
              {report.grade}
            </span>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Overall Score</div>
            <div className="text-2xl font-bold">{report.overallScore}/100</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Positions</div>
            <div className="text-lg font-semibold">{report.numberOfPositions}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Beta</div>
            <div className="text-lg font-semibold">{report.portfolioBeta}</div>
          </div>
        </div>

        {/* Concentration warnings */}
        {report.concentrationWarnings.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {report.concentrationWarnings.map((warning, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-yellow-500 border-yellow-500/50"
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                {warning}
              </Badge>
            ))}
          </div>
        )}

        {expanded && (
          <div className="space-y-5 mt-4 pt-4 border-t border-border">
            {/* Sector Allocation Bar */}
            {report.sectorAllocation.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Sector Allocation
                </h4>
                {/* Stacked horizontal bar */}
                <div className="h-6 rounded-md overflow-hidden flex mb-2">
                  {report.sectorAllocation.map((s) => (
                    <div
                      key={s.sector}
                      className="h-full relative group"
                      style={{
                        width: `${Math.max(s.weight, 1)}%`,
                        backgroundColor: getSectorColor(s.sector),
                      }}
                      title={`${s.sector}: ${s.weight.toFixed(1)}%`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap">
                          {s.weight.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {report.sectorAllocation.map((s) => (
                    <div key={s.sector} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: getSectorColor(s.sector) }}
                      />
                      <span className="text-muted-foreground">
                        {s.sector} ({s.weight.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Sector diversification score: {report.sectorConcentrationScore}/100
                </div>
              </div>
            )}

            {/* Top Holdings */}
            {report.topHoldings.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Top Holdings
                </h4>
                <div className="space-y-1.5">
                  {report.topHoldings.map((h) => (
                    <div key={h.symbol} className="flex items-center gap-2">
                      <span className="text-sm font-medium w-16">{h.symbol}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(h.weight, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-14 text-right">
                        {h.weight.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Position diversification score: {report.diversificationScore}/100
                </div>
              </div>
            )}

            {/* Risk Metrics */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Risk Metrics
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Portfolio Beta</div>
                  <div className="text-lg font-semibold">
                    {report.portfolioBeta.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {report.portfolioBeta > 1.3
                      ? "Aggressive"
                      : report.portfolioBeta > 1.0
                        ? "Moderate"
                        : report.portfolioBeta > 0.7
                          ? "Balanced"
                          : "Defensive"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    High Beta Exposure
                  </div>
                  <div className="text-lg font-semibold">
                    {report.highBetaExposure.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {report.highBetaExposure > 30
                      ? "Elevated risk"
                      : "Within normal range"}
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestions */}
            {report.suggestions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Suggestions
                </h4>
                <ul className="space-y-1.5">
                  {report.suggestions.map((s, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="text-primary mt-0.5">-</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { BarChart3 } from "lucide-react"

interface EarningsEvent {
  date: string
  epsActual: number | null
  epsEstimate: number | null
  hour: string
  quarter: number
  revenueActual: number | null
  revenueEstimate: number | null
  symbol: string
  year: number
}

function formatHour(hour: string): string {
  switch (hour) {
    case "bmo":
      return "Before Open"
    case "amc":
      return "After Close"
    case "dmh":
      return "During Market"
    default:
      return hour || "TBD"
  }
}

function formatRevenue(n: number | null): string {
  if (n === null) return "--"
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  return `$${n.toLocaleString()}`
}

export function EarningsCalendar() {
  const [events, setEvents] = useState<EarningsEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/api/market/earnings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.events) {
          setEvents(data.events)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 5 }).map((_, j) => (
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

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <BarChart3 className="h-10 w-10 mb-3 opacity-50" />
        <p>No upcoming earnings found</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">EPS Est.</TableHead>
          <TableHead className="text-right hidden sm:table-cell">
            Rev. Est.
          </TableHead>
          <TableHead className="hidden md:table-cell">Time</TableHead>
          <TableHead className="text-right hidden md:table-cell">
            Quarter
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event, idx) => (
          <TableRow key={`${event.symbol}-${event.date}-${idx}`}>
            <TableCell>
              <Link
                href={`/stock/${event.symbol}`}
                className="font-bold text-primary hover:underline"
              >
                {event.symbol}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {event.date}
            </TableCell>
            <TableCell className="text-right font-medium">
              {event.epsEstimate !== null
                ? `$${event.epsEstimate.toFixed(2)}`
                : "--"}
            </TableCell>
            <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
              {formatRevenue(event.revenueEstimate)}
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="secondary" className="text-xs">
                {formatHour(event.hour)}
              </Badge>
            </TableCell>
            <TableCell className="text-right hidden md:table-cell text-muted-foreground">
              Q{event.quarter} {event.year}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

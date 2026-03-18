"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Bell, Trash2, RefreshCw } from "lucide-react"
import { CreateAlertDialog } from "@/components/alerts/create-alert-dialog"
import { useCurrency } from "@/hooks/useCurrency"

interface Alert {
  id: string
  symbol: string
  condition_type: "above" | "below" | "pct_change"
  condition_value: string
  is_active: boolean
  triggered_at: string | null
  created_at: string
}

interface QuoteData {
  price: number
}

const CONDITION_LABELS: Record<string, string> = {
  above: "Price Above",
  below: "Price Below",
  pct_change: "% Change",
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({})
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { fmtNative } = useCurrency()

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts")
      if (res.ok) {
        const data = await res.json()
        setAlerts(data)

        // Fetch current prices for unique symbols
        const symbols = Array.from(
          new Set(data.map((a: Alert) => a.symbol))
        ) as string[]
        if (symbols.length > 0) {
          try {
            const quoteRes = await fetch(
              `/api/market/quote?symbols=${symbols.join(",")}`
            )
            if (quoteRes.ok) {
              const quoteData = await quoteRes.json()
              const list = Array.isArray(quoteData) ? quoteData : [quoteData]
              const quoteMap: Record<string, QuoteData> = {}
              list.forEach(
                (q: { symbol: string; regularMarketPrice: number }) => {
                  quoteMap[q.symbol] = { price: q.regularMarketPrice }
                }
              )
              setQuotes(quoteMap)
            }
          } catch {
            // Quotes are optional - alerts still display
          }
        }
      }
    } catch {
      // Handle silently
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/alerts?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id))
      }
    } catch {
      // Handle silently
    } finally {
      setDeleting(null)
    }
  }

  async function handleCheckAlerts() {
    setChecking(true)
    try {
      await fetch("/api/alerts/check")
      await fetchAlerts()
    } catch {
      // Handle silently
    } finally {
      setChecking(false)
    }
  }

  function formatConditionValue(alert: Alert) {
    if (alert.condition_type === "pct_change") {
      return `${parseFloat(alert.condition_value).toFixed(1)}%`
    }
    return fmtNative(parseFloat(alert.condition_value))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground">
            Monitor price targets and percentage changes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckAlerts}
            disabled={checking}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
            />
            {checking ? "Checking..." : "Check Now"}
          </Button>
          <CreateAlertDialog onAlertCreated={fetchAlerts} />
        </div>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No alerts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first alert to get notified when conditions are met.
            </p>
            <CreateAlertDialog onAlertCreated={fetchAlerts} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {alerts.length} Alert{alerts.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Current Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">
                      {alert.symbol}
                    </TableCell>
                    <TableCell>
                      {CONDITION_LABELS[alert.condition_type] ??
                        alert.condition_type}
                    </TableCell>
                    <TableCell>{formatConditionValue(alert)}</TableCell>
                    <TableCell>
                      {quotes[alert.symbol]
                        ? fmtNative(quotes[alert.symbol].price)
                        : "--"}
                    </TableCell>
                    <TableCell>
                      {alert.is_active ? (
                        <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border-0">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border-0">
                          Triggered
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => handleDelete(alert.id)}
                        disabled={deleting === alert.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

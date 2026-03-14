"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

interface ExportPosition {
  symbol: string
  quantity: number
  averageCost: number
  currentPrice: number
  marketValue: number
  pnl: number
  pnlPct: number
}

interface CsvExportProps {
  positions: ExportPosition[]
  portfolioName: string
}

export function CsvExport({ positions, portfolioName }: CsvExportProps) {
  function handleExport() {
    const headers = ["Symbol", "Quantity", "Avg Cost", "Current Price", "Market Value", "P&L", "P&L%"]
    const rows = positions.map((p) => [
      p.symbol,
      p.quantity.toString(),
      p.averageCost.toFixed(2),
      p.currentPrice.toFixed(2),
      p.marketValue.toFixed(2),
      p.pnl.toFixed(2),
      p.pnlPct.toFixed(2) + "%",
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const safeName = portfolioName.replace(/[^a-zA-Z0-9]/g, "_")
    link.download = `${safeName}_positions_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={positions.length === 0}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  )
}

"use client"

import type { Quote } from "@/types/market"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

function formatNumber(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toLocaleString()}`
}

export function QuoteHeader({ quote }: { quote: Quote }) {
  const isPositive = quote.regularMarketChange >= 0

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-bold">{quote.symbol}</h1>
        <span className="text-lg text-muted-foreground">{quote.shortName}</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold">
          ${quote.regularMarketPrice.toFixed(2)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 text-lg font-medium",
            isPositive ? "text-green-500" : "text-red-500"
          )}
        >
          {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {isPositive ? "+" : ""}
          {quote.regularMarketChange.toFixed(2)} ({isPositive ? "+" : ""}
          {quote.regularMarketChangePercent.toFixed(2)}%)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 text-sm">
        <div>
          <span className="text-muted-foreground">Open</span>
          <p className="font-medium">${quote.regularMarketOpen.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Day Range</span>
          <p className="font-medium">
            ${quote.regularMarketDayLow.toFixed(2)} - ${quote.regularMarketDayHigh.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">52W Range</span>
          <p className="font-medium">
            ${quote.fiftyTwoWeekLow.toFixed(2)} - ${quote.fiftyTwoWeekHigh.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Market Cap</span>
          <p className="font-medium">{formatNumber(quote.marketCap)}</p>
        </div>
      </div>
    </div>
  )
}

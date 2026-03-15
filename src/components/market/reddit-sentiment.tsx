"use client"

import { useEffect, useState } from "react"
import type { StockSentiment } from "@/lib/market/reddit"

export function RedditSentiment({ symbol }: { symbol: string }) {
  const [data, setData] = useState<StockSentiment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    fetch(`/api/market/sentiment?symbol=${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d)
        else setError(true)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#787b86" }}
        >
          Reddit Sentiment
        </h2>
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-md overflow-hidden"
          style={{ background: "#2a2e39" }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-3 py-3" style={{ background: "#131722" }}>
              <div className="h-3 w-16 bg-slate-800 rounded animate-pulse mb-1.5" />
              <div className="h-4 w-20 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) return null

  // Check if we have any data at all
  const hasWSB =
    data.wsbSentiment !== null || data.wsbComments !== null
  const hasMentions = data.redditMentions !== null
  if (!hasWSB && !hasMentions) {
    return (
      <div className="space-y-3">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#787b86" }}
        >
          Reddit Sentiment
        </h2>
        <div
          className="rounded-md px-4 py-6 text-center text-sm"
          style={{ background: "#131722", color: "#787b86" }}
        >
          No Reddit sentiment data available for {symbol}
        </div>
      </div>
    )
  }

  const sentimentColor =
    data.wsbSentiment === "Bullish"
      ? "#26a69a"
      : data.wsbSentiment === "Bearish"
        ? "#ef5350"
        : "#787b86"

  const sentimentPct =
    data.wsbSentimentScore !== null
      ? Math.round(data.wsbSentimentScore * 100)
      : null

  const metrics = [
    ...(hasWSB
      ? [
          {
            label: "WSB Sentiment",
            value: data.wsbSentiment ?? "--",
            color: sentimentColor,
          },
          {
            label: "Sentiment Score",
            value: sentimentPct !== null ? `${sentimentPct}%` : "--",
            color: sentimentColor,
          },
          {
            label: "WSB Comments",
            value:
              data.wsbComments !== null
                ? data.wsbComments.toLocaleString()
                : "--",
          },
        ]
      : []),
    ...(hasMentions
      ? [
          {
            label: "Reddit Mentions",
            value:
              data.redditMentions !== null
                ? data.redditMentions.toLocaleString()
                : "--",
          },
          {
            label: "Reddit Rank",
            value:
              data.redditRank !== null ? `#${data.redditRank}` : "--",
          },
          {
            label: "Upvotes",
            value:
              data.redditUpvotes !== null
                ? data.redditUpvotes.toLocaleString()
                : "--",
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-3">
      <h2
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: "#787b86" }}
      >
        Reddit Sentiment
      </h2>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-md overflow-hidden"
        style={{ background: "#2a2e39" }}
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="px-3 py-3"
            style={{ background: "#131722" }}
          >
            <div
              className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: "#787b86" }}
            >
              {metric.label}
            </div>
            <div
              className="text-sm font-medium"
              style={{ color: "color" in metric && metric.color ? metric.color : "#d1d4dc" }}
            >
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sentiment bar */}
      {sentimentPct !== null && (
        <div className="px-1">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "#2a2e39" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${sentimentPct}%`,
                background:
                  sentimentPct >= 50
                    ? `linear-gradient(90deg, #26a69a, #26a69a)`
                    : `linear-gradient(90deg, #ef5350, #ef5350)`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: "#787b86" }}>
            <span>Bearish</span>
            <span>Bullish</span>
          </div>
        </div>
      )}
    </div>
  )
}

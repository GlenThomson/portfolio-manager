"use client"

import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"

interface NewsItem {
  title: string
  publisher: string
  link: string
  publishedAt: string
  thumbnail: string | null
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return ""
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then

  if (diff < 0) return "Just now"

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function StockNews({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/market/news?symbol=${symbol}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setNews(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#787b86" }}>
          News
        </h2>
        <div className="space-y-px rounded-md overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3" style={{ background: "#131722" }}>
              <div className="h-4 w-3/4 bg-slate-800 rounded animate-pulse mb-2" />
              <div className="h-3 w-1/3 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (news.length === 0) return null

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#787b86" }}>
        News
      </h2>
      <div className="space-y-px rounded-md overflow-hidden" style={{ background: "#2a2e39" }}>
        {news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/50 group"
            style={{ background: "#131722" }}
          >
            <div className="flex-1 min-w-0">
              <h3
                className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-blue-400 transition-colors"
                style={{ color: "#d1d4dc" }}
              >
                {item.title}
              </h3>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px]" style={{ color: "#787b86" }}>
                  {item.publisher}
                </span>
                {item.publishedAt && (
                  <>
                    <span className="text-[11px]" style={{ color: "#555" }}>
                      &middot;
                    </span>
                    <span className="text-[11px]" style={{ color: "#787b86" }}>
                      {timeAgo(item.publishedAt)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <ExternalLink
              className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "#787b86" }}
            />
          </a>
        ))}
      </div>
    </div>
  )
}

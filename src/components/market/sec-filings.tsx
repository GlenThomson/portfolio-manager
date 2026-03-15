"use client"

import { useEffect, useState } from "react"
import { ExternalLink, FileText, Loader2 } from "lucide-react"

interface Filing {
  type: string
  date: string
  accessionNumber: string
  primaryDocument: string
  description: string
}

function filingTypeColor(type: string): string {
  if (type.startsWith("10-K")) return "#26a69a" // Annual - green
  if (type.startsWith("10-Q")) return "#42a5f5" // Quarterly - blue
  if (type.startsWith("8-K")) return "#ffa726"  // Current - orange
  return "#787b86"
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function getSecUrl(accessionNumber: string, primaryDocument: string): string {
  const accessionClean = accessionNumber.replace(/-/g, "")
  const cikNum = accessionNumber.split("-")[0].replace(/^0+/, "")
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionClean}/${primaryDocument}`
}

export function SecFilings({ symbol }: { symbol: string }) {
  const [filings, setFilings] = useState<Filing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/market/filings?symbol=${symbol}&count=10`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setFilings(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol])

  if (loading) {
    return (
      <div className="space-y-3">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "#787b86" }}
        >
          SEC Filings
        </h2>
        <div className="flex items-center justify-center py-8 rounded-md" style={{ background: "#131722" }}>
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#787b86" }} />
        </div>
      </div>
    )
  }

  if (filings.length === 0) return null

  return (
    <div className="space-y-3">
      <h2
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: "#787b86" }}
      >
        SEC Filings
      </h2>
      <div
        className="space-y-px rounded-md overflow-hidden"
        style={{ background: "#2a2e39" }}
      >
        {filings.map((filing, i) => (
          <a
            key={i}
            href={getSecUrl(filing.accessionNumber, filing.primaryDocument)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-800/50 group"
            style={{ background: "#131722" }}
          >
            <FileText
              className="h-4 w-4 flex-shrink-0"
              style={{ color: filingTypeColor(filing.type) }}
            />
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <span
                className="text-xs font-mono font-semibold flex-shrink-0"
                style={{ color: filingTypeColor(filing.type), minWidth: "3.5rem" }}
              >
                {filing.type}
              </span>
              <span
                className="text-sm truncate group-hover:text-blue-400 transition-colors"
                style={{ color: "#d1d4dc" }}
              >
                {filing.description || filing.type}
              </span>
            </div>
            <span
              className="text-xs flex-shrink-0"
              style={{ color: "#787b86" }}
            >
              {formatDate(filing.date)}
            </span>
            <ExternalLink
              className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "#787b86" }}
            />
          </a>
        ))}
      </div>
    </div>
  )
}

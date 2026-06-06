"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface StockLogoProps {
  symbol: string
  size?: number          // px — default 20
  className?: string
}

// In-memory cache so repeated renders for the same symbol skip refetch.
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

async function loadLogo(symbol: string): Promise<string | null> {
  if (cache.has(symbol)) return cache.get(symbol)!
  if (inflight.has(symbol)) return inflight.get(symbol)!

  const promise = fetch(`/api/market/logo?symbol=${encodeURIComponent(symbol)}`)
    .then((r) => r.ok ? r.json() : null)
    .then((d: { logo: string | null } | null) => d?.logo ?? null)
    .catch(() => null)
    .finally(() => inflight.delete(symbol))

  inflight.set(symbol, promise)
  const result = await promise
  cache.set(symbol, result)
  return result
}

// Deterministic colour per symbol — used for the letter-avatar fallback.
function hashColor(symbol: string): string {
  let hash = 0
  for (let i = 0; i < symbol.length; i++) hash = ((hash << 5) - hash + symbol.charCodeAt(i)) | 0
  const colors = [
    "#2962ff", "#26a69a", "#ff9500", "#7b61ff", "#ef5350",
    "#9333ea", "#0891b2", "#16a34a", "#ea580c", "#db2777",
  ]
  return colors[Math.abs(hash) % colors.length]
}

export function StockLogo({ symbol, size = 20, className }: StockLogoProps) {
  const upper = symbol.toUpperCase()
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(() => cache.get(upper))
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (logoUrl !== undefined) return
    let cancelled = false
    loadLogo(upper).then((url) => { if (!cancelled) setLogoUrl(url) })
    return () => { cancelled = true }
  }, [upper, logoUrl])

  const dimension = { width: size, height: size }
  const showFallback = !logoUrl || imgError

  if (showFallback) {
    return (
      <div
        className={cn("rounded inline-flex items-center justify-center text-white font-semibold shrink-0", className)}
        style={{ ...dimension, background: hashColor(upper), fontSize: size * 0.45 }}
        title={upper}
      >
        {upper.charAt(0)}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={upper}
      title={upper}
      width={size}
      height={size}
      className={cn("rounded shrink-0 bg-white object-contain", className)}
      style={dimension}
      onError={() => setImgError(true)}
    />
  )
}

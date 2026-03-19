"use client"

import { useEffect, useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import type { OptionsChainData, OptionContract } from "@/types/market"
import { Loader2 } from "lucide-react"

// ── Helpers ─────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  })
}

function dteFromNow(ts: number) {
  return Math.max(0, Math.round((ts - Date.now() / 1000) / 86400))
}

function formatIV(iv: number) {
  return iv > 0.001 ? `${(iv * 100).toFixed(1)}%` : "—"
}

function formatGreek(val: number | undefined, decimals = 3) {
  if (val === undefined || val === 0) return "—"
  return val.toFixed(decimals)
}

function formatYield(val: number | undefined) {
  if (!val || val <= 0) return "—"
  return `${val.toFixed(1)}%`
}

function formatVol(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n > 0 ? n.toString() : "—"
}

// ── Styling constants ───────────────────────────────────────

const BG = "#131722"
const BORDER = "#2a2e39"
const TEXT_DIM = "#787b86"
const TEXT = "#d1d4dc"
const ITM_CALL_BG = "rgba(38, 166, 154, 0.08)"
const ITM_PUT_BG = "rgba(239, 83, 80, 0.08)"
const ATM_BORDER = "rgba(41, 98, 255, 0.5)"

// ── Component ───────────────────────────────────────────────

interface OptionsChainProps {
  symbol: string
  underlyingPrice?: number
}

type ViewMode = "all" | "calls" | "puts"

export function OptionsChain({ symbol }: OptionsChainProps) {
  const [data, setData] = useState<OptionsChainData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedExp, setSelectedExp] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("all")
  const [strikeFilter, setStrikeFilter] = useState<"all" | "otm" | "itm" | "near">("near")

  // Fetch options chain
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ symbol })
    if (selectedExp) params.set("expiration", selectedExp.toString())

    fetch(`/api/market/options?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OptionsChainData | null) => {
        if (d) {
          setData(d)
          if (!selectedExp && d.expirationDates.length > 0) {
            setSelectedExp(d.selectedExpiration)
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [symbol, selectedExp])

  // Filter strikes
  const { filteredCalls, filteredPuts, atmStrike } = useMemo(() => {
    if (!data) return { filteredCalls: [], filteredPuts: [], atmStrike: 0 }

    const price = data.underlyingPrice
    // Find ATM strike
    const allStrikes = Array.from(new Set([...data.calls.map((c) => c.strike), ...data.puts.map((p) => p.strike)])).sort((a, b) => a - b)
    const atm = allStrikes.reduce((best, s) => (Math.abs(s - price) < Math.abs(best - price) ? s : best), allStrikes[0] ?? 0)

    const filterFn = (c: OptionContract) => {
      if (strikeFilter === "all") return true
      if (strikeFilter === "otm") return !c.inTheMoney
      if (strikeFilter === "itm") return c.inTheMoney
      // "near" — within ~10 strikes of ATM
      return Math.abs(c.strike - atm) / price < 0.15
    }

    return {
      filteredCalls: data.calls.filter(filterFn),
      filteredPuts: data.puts.filter(filterFn),
      atmStrike: atm,
    }
  }, [data, strikeFilter])

  // Best for selling (top 3 OTM by premium yield with decent OI)
  const bestCalls = useMemo(() => {
    if (!data) return new Set<number>()
    return new Set(
      data.calls
        .filter((c) => !c.inTheMoney && c.openInterest > 50 && (c.premiumYield ?? 0) > 0)
        .sort((a, b) => (b.premiumYield ?? 0) - (a.premiumYield ?? 0))
        .slice(0, 3)
        .map((c) => c.strike)
    )
  }, [data])

  const bestPuts = useMemo(() => {
    if (!data) return new Set<number>()
    return new Set(
      data.puts
        .filter((p) => !p.inTheMoney && p.openInterest > 50 && (p.premiumYield ?? 0) > 0)
        .sort((a, b) => (b.premiumYield ?? 0) - (a.premiumYield ?? 0))
        .slice(0, 3)
        .map((p) => p.strike)
    )
  }, [data])

  if (loading && !data) {
    return (
      <div className="rounded-md flex items-center justify-center" style={{ background: BG, height: 400 }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: TEXT_DIM }} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="rounded-md flex items-center justify-center" style={{ background: BG, height: 200 }}>
        <p style={{ color: TEXT_DIM }} className="text-sm">No options data available for {symbol}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ── IV Stats Banner ──────────────────────────────── */}
      <div className="rounded-md p-3" style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* IV Rank gauge */}
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>IV Rank</div>
              <div className="text-lg font-bold" style={{ color: ivRankColor(data.ivStats.rank) }}>
                {data.ivStats.rank}
              </div>
            </div>
            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: "#1e222d" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${data.ivStats.rank}%`,
                  background: ivRankColor(data.ivStats.rank),
                }}
              />
            </div>
          </div>

          <StatCell label="ATM IV" value={`${data.ivStats.median.toFixed(1)}%`} />
          <StatCell label="IV High" value={`${data.ivStats.high.toFixed(1)}%`} />
          <StatCell label="IV Low" value={`${data.ivStats.low.toFixed(1)}%`} />
          <StatCell label="DTE" value={data.daysToExpiry.toString()} />
          <StatCell label="Underlying" value={`$${data.underlyingPrice.toFixed(2)}`} />

          {/* Selling signal */}
          <div className="ml-auto">
            {data.ivStats.rank >= 50 ? (
              <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: "rgba(38,166,154,0.15)", color: "#26a69a" }}>
                IV elevated — good for selling
              </span>
            ) : (
              <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: "rgba(239,83,80,0.1)", color: TEXT_DIM }}>
                IV low — less premium available
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Controls Row ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Expiration selector */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 pb-1">
          {data.expirationDates.slice(0, 12).map((exp) => {
            const dte = dteFromNow(exp)
            return (
              <button
                key={exp}
                onClick={() => setSelectedExp(exp)}
                className={cn(
                  "px-2 py-1 text-xs rounded whitespace-nowrap transition-colors shrink-0",
                  selectedExp === exp
                    ? "bg-[#2962ff] text-white font-medium"
                    : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]"
                )}
              >
                {formatDate(exp)} <span className="opacity-60">({dte}d)</span>
              </button>
            )
          })}
        </div>

        {/* View mode */}
        <div className="flex gap-0.5 rounded p-0.5" style={{ background: "#1e222d" }}>
          {(["all", "calls", "puts"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-2 py-1 text-xs rounded capitalize transition-colors",
                viewMode === mode ? "bg-[#2a2e39] text-[#d1d4dc] font-medium" : "text-[#787b86]"
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Strike filter */}
        <div className="flex gap-0.5 rounded p-0.5" style={{ background: "#1e222d" }}>
          {([
            { key: "near" as const, label: "Near ATM" },
            { key: "otm" as const, label: "OTM" },
            { key: "itm" as const, label: "ITM" },
            { key: "all" as const, label: "All" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStrikeFilter(key)}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors",
                strikeFilter === key ? "bg-[#2a2e39] text-[#d1d4dc] font-medium" : "text-[#787b86]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chain Table ──────────────────────────────────── */}
      <div className="rounded-md overflow-hidden" style={{ background: BG, border: `1px solid ${BORDER}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: TEXT }}>
            <thead>
              <tr style={{ background: "#1e222d" }}>
                {(viewMode === "all" || viewMode === "calls") && (
                  <>
                    <th className="px-2 py-2 text-left font-medium" style={{ color: TEXT_DIM }}>Yield</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Bid</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Ask</th>
                    <th className="px-2 py-2 text-right font-medium hidden md:table-cell" style={{ color: TEXT_DIM }}>Vol</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>OI</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>IV</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Delta</th>
                    <th className="px-2 py-2 text-right font-medium hidden lg:table-cell" style={{ color: TEXT_DIM }}>Theta</th>
                  </>
                )}
                <th
                  className="px-3 py-2 text-center font-bold"
                  style={{ color: "#2962ff", background: "rgba(41,98,255,0.08)" }}
                >
                  Strike
                </th>
                {(viewMode === "all" || viewMode === "puts") && (
                  <>
                    <th className="px-2 py-2 text-right font-medium hidden lg:table-cell" style={{ color: TEXT_DIM }}>Theta</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Delta</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>IV</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>OI</th>
                    <th className="px-2 py-2 text-right font-medium hidden md:table-cell" style={{ color: TEXT_DIM }}>Vol</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Bid</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Ask</th>
                    <th className="px-2 py-2 text-right font-medium" style={{ color: TEXT_DIM }}>Yield</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {buildRows(filteredCalls, filteredPuts, atmStrike, viewMode, bestCalls, bestPuts)}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-[10px]" style={{ color: TEXT_DIM }}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: "#26a69a" }} /> Best OTM for selling
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: ITM_CALL_BG, border: "1px solid rgba(38,166,154,0.3)" }} /> In the money
        </span>
        <span>Yield = annualized return if expires worthless (based on bid)</span>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_DIM }}>{label}</div>
      <div className="text-sm font-medium" style={{ color: TEXT }}>{value}</div>
    </div>
  )
}

function ivRankColor(rank: number): string {
  if (rank >= 70) return "#26a69a" // high IV = good for selling
  if (rank >= 40) return "#ffab00"
  return "#ef5350" // low IV
}

// ── Row builder ─────────────────────────────────────────────

function buildRows(
  calls: OptionContract[],
  puts: OptionContract[],
  atmStrike: number,
  viewMode: ViewMode,

  bestCalls: Set<number>,
  bestPuts: Set<number>,
) {
  // Build a unified list of strikes
  const strikeSet = new Set<number>()
  calls.forEach((c) => strikeSet.add(c.strike))
  puts.forEach((p) => strikeSet.add(p.strike))
  const strikes = Array.from(strikeSet).sort((a, b) => a - b)

  const callMap = new Map(calls.map((c) => [c.strike, c]))
  const putMap = new Map(puts.map((p) => [p.strike, p]))

  return strikes.map((strike) => {
    const call = callMap.get(strike)
    const put = putMap.get(strike)
    const isATM = strike === atmStrike
    const borderStyle = isATM ? `2px solid ${ATM_BORDER}` : undefined

    return (
      <tr
        key={strike}
        className="hover:bg-[#1e222d] transition-colors"
        style={{ borderTop: borderStyle, borderBottom: borderStyle }}
      >
        {(viewMode === "all" || viewMode === "calls") && (
          <ContractCells
            contract={call}
            type="call"
            isBest={bestCalls.has(strike)}

          />
        )}
        <td
          className="px-3 py-1.5 text-center font-bold whitespace-nowrap"
          style={{
            color: isATM ? "#2962ff" : TEXT,
            background: "rgba(41,98,255,0.04)",
            fontSize: "11px",
          }}
        >
          {strike.toFixed(strike >= 100 ? 0 : 2)}
          {isATM && <span className="ml-1 text-[9px] font-normal" style={{ color: "#2962ff" }}>ATM</span>}
        </td>
        {(viewMode === "all" || viewMode === "puts") && (
          <ContractCells
            contract={put}
            type="put"
            isBest={bestPuts.has(strike)}

            reverse
          />
        )}
      </tr>
    )
  })
}

function ContractCells({
  contract,
  type,
  isBest,
  reverse = false,
}: {
  contract: OptionContract | undefined
  type: "call" | "put"
  isBest: boolean
  reverse?: boolean
}) {
  if (!contract) {
    const emptyCells = (
      <>
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5 hidden md:table-cell" />
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5" />
        <td className="px-2 py-1.5 hidden lg:table-cell" />
      </>
    )
    return emptyCells
  }

  const bg = contract.inTheMoney ? (type === "call" ? ITM_CALL_BG : ITM_PUT_BG) : undefined
  const bestBorder = isBest ? "2px solid rgba(38,166,154,0.5)" : undefined
  const yieldColor = (contract.premiumYield ?? 0) > 20 ? "#26a69a" : (contract.premiumYield ?? 0) > 10 ? "#ffab00" : TEXT_DIM

  // Cells in standard order (for calls: yield, bid, ask, vol, oi, iv, delta, theta)
  const cells = [
    <td key="yield" className="px-2 py-1.5 text-left font-medium" style={{ color: yieldColor, borderLeft: bestBorder }}>
      {formatYield(contract.premiumYield)}
    </td>,
    <td key="bid" className="px-2 py-1.5 text-right" style={{ color: contract.bid > 0 ? TEXT : TEXT_DIM }}>
      {contract.bid > 0 ? contract.bid.toFixed(2) : "—"}
    </td>,
    <td key="ask" className="px-2 py-1.5 text-right" style={{ color: TEXT_DIM }}>
      {contract.ask > 0 ? contract.ask.toFixed(2) : "—"}
    </td>,
    <td key="vol" className="px-2 py-1.5 text-right hidden md:table-cell" style={{ color: TEXT_DIM }}>
      {formatVol(contract.volume)}
    </td>,
    <td key="oi" className="px-2 py-1.5 text-right" style={{ color: contract.openInterest > 1000 ? TEXT : TEXT_DIM }}>
      {formatVol(contract.openInterest)}
    </td>,
    <td key="iv" className="px-2 py-1.5 text-right" style={{ color: TEXT_DIM }}>
      {formatIV(contract.impliedVolatility)}
    </td>,
    <td key="delta" className="px-2 py-1.5 text-right font-mono" style={{ color: TEXT }}>
      {formatGreek(contract.delta)}
    </td>,
    <td key="theta" className="px-2 py-1.5 text-right font-mono hidden lg:table-cell" style={{ color: (contract.theta ?? 0) < 0 ? "#26a69a" : TEXT_DIM }}>
      {formatGreek(contract.theta, 2)}
    </td>,
  ]

  // For puts (right side), reverse the column order so it mirrors calls
  const orderedCells = reverse ? [...cells].reverse() : cells

  return (
    <>
      {orderedCells.map((cell) => {
        // Apply background to all cells in this contract
        if (bg) {
          return (
            <td
              key={cell.key}
              className={cell.props.className}
              style={{ ...cell.props.style, background: bg }}
            >
              {cell.props.children}
            </td>
          )
        }
        return cell
      })}
    </>
  )
}

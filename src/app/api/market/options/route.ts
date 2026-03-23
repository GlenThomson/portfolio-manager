import { NextRequest, NextResponse } from "next/server"
import { getOptions, getChart } from "@/lib/market/yahoo"
import { blackScholesGreeks, premiumYield, ivStats, ivRank, historicalVolatility, pendulumScore } from "@/lib/market/options-math"
import { isValidSymbol } from "@/lib/validation"
import type { OptionContract, OptionsChainData } from "@/types/market"

const RISK_FREE_RATE = 0.043 // ~4.3% — approximate current rate

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const expiration = searchParams.get("expiration")

  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 })
  }

  try {
    // Fetch options chain + 60 days of price history in parallel
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const [raw, chartData] = await Promise.all([
      getOptions(symbol.toUpperCase(), expiration ? parseInt(expiration) : undefined),
      getChart(symbol.toUpperCase(), sixtyDaysAgo, "1d").catch(() => []),
    ])

    if (raw.expirationDates.length === 0) {
      return NextResponse.json({ error: "No options available for this symbol" }, { status: 404 })
    }

    const selectedExp = expiration ? parseInt(expiration) : raw.expirationDates[0]
    const now = Date.now() / 1000
    const dte = Math.max(1, Math.round((selectedExp - now) / 86400))
    const T = dte / 365
    const S = raw.underlyingPrice

    // Compute Greeks and premium yield for each contract
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichContract = (c: any, type: "call" | "put"): OptionContract => {
      const greeks = blackScholesGreeks(S, c.strike, T, RISK_FREE_RATE, c.impliedVolatility, type)
      return {
        ...c,
        delta: Math.round(greeks.delta * 1000) / 1000,
        gamma: Math.round(greeks.gamma * 10000) / 10000,
        theta: Math.round(greeks.theta * 100) / 100,
        vega: Math.round(greeks.vega * 100) / 100,
        premiumYield: Math.round(premiumYield(c.bid, c.strike, dte) * 100) / 100,
      }
    }

    const calls = raw.calls.map((c: any) => enrichContract(c, "call"))
    const puts = raw.puts.map((c: any) => enrichContract(c, "put"))

    // IV statistics from ATM options (strikes near underlying price)
    const allIVs = [...raw.calls, ...raw.puts]
      .map((c) => c.impliedVolatility)
      .filter((v) => v > 0.001)
    const stats = ivStats(allIVs)

    // ATM IV (closest strike to underlying)
    const atmContracts = [...raw.calls, ...raw.puts]
      .filter((c) => Math.abs(c.strike - S) / S < 0.05 && c.impliedVolatility > 0.001)
    const atmIV = atmContracts.length > 0
      ? (atmContracts.reduce((s, c) => s + c.impliedVolatility, 0) / atmContracts.length) * 100
      : stats.avg

    // Compute Historical Volatility from price data
    const closes = Array.isArray(chartData) ? chartData.map((d: { close: number }) => d.close).filter(Boolean) : []
    const hv = historicalVolatility(closes)

    // Compute put/call skew from OTM options near the money (within 10% of underlying)
    const otmPuts = raw.puts.filter((c: { strike: number; impliedVolatility: number }) =>
      c.strike < S && c.strike > S * 0.9 && c.impliedVolatility > 0.001
    )
    const otmCalls = raw.calls.filter((c: { strike: number; impliedVolatility: number }) =>
      c.strike > S && c.strike < S * 1.1 && c.impliedVolatility > 0.001
    )
    const putAvgIV = otmPuts.length > 0
      ? (otmPuts.reduce((s: number, c: { impliedVolatility: number }) => s + c.impliedVolatility, 0) / otmPuts.length) * 100
      : 0
    const callAvgIV = otmCalls.length > 0
      ? (otmCalls.reduce((s: number, c: { impliedVolatility: number }) => s + c.impliedVolatility, 0) / otmCalls.length) * 100
      : 0

    // Avg premium yield for near-ATM OTM puts
    const nearPuts = puts.filter((c: OptionContract) =>
      c.strike < S && c.strike > S * 0.95 && (c.premiumYield ?? 0) > 0
    )
    const avgYield = nearPuts.length > 0
      ? nearPuts.reduce((s: number, c: OptionContract) => s + (c.premiumYield ?? 0), 0) / nearPuts.length
      : 0

    const computedIvRank = Math.round(ivRank(atmIV, stats.low, stats.high))

    // Compute pendulum score
    const pendulum = pendulumScore({
      ivRank: computedIvRank,
      atmIV,
      hvAnnualized: hv.hvAnnualized,
      putAvgIV,
      callAvgIV,
      avgPremiumYield: avgYield,
      hv20: hv.hv20,
    })

    const result: OptionsChainData = {
      symbol: symbol.toUpperCase(),
      underlyingPrice: S,
      expirationDates: raw.expirationDates,
      selectedExpiration: selectedExp,
      daysToExpiry: dte,
      calls,
      puts,
      ivStats: {
        avg: Math.round(stats.avg * 10) / 10,
        high: Math.round(stats.high * 10) / 10,
        low: Math.round(stats.low * 10) / 10,
        median: Math.round(stats.median * 10) / 10,
        rank: computedIvRank,
      },
      pendulum,
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (error) {
    console.error("Options fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch options data" }, { status: 500 })
  }
}

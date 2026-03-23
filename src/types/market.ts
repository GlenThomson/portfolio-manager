export interface Quote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketPreviousClose: number
  regularMarketOpen: number
  regularMarketDayHigh: number
  regularMarketDayLow: number
  regularMarketVolume: number
  marketCap: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  currency: string
  trailingPE: number | null
  epsTrailingTwelveMonths: number | null
  dividendYield: number | null
  beta: number | null
}

export interface OHLC {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorData {
  time: number
  value: number
}

export type MarketStatus = "open" | "closed" | "pre-market" | "after-hours"

// ── Options ──────────────────────────────────────────────────

export interface OptionContract {
  contractSymbol: string
  strike: number
  lastPrice: number
  bid: number
  ask: number
  change: number
  percentChange: number
  volume: number
  openInterest: number
  impliedVolatility: number // decimal (e.g. 0.30 = 30%)
  inTheMoney: boolean
  expiration: number // unix timestamp
  // Computed fields (added by API)
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
  premiumYield?: number // annualized % return if expires worthless
}

export interface OptionsChainData {
  symbol: string
  underlyingPrice: number
  expirationDates: number[] // unix timestamps of all available expirations
  selectedExpiration: number
  daysToExpiry: number
  calls: OptionContract[]
  puts: OptionContract[]
  ivStats: {
    avg: number
    high: number
    low: number
    median: number
    rank: number // 0-100
  }
  pendulum?: {
    score: number
    label: string
    ivRankSignal: number
    ivHvSignal: number
    skewSignal: number
    yieldSignal: number
    hv20: number
    hvAnnualized: number
  }
}

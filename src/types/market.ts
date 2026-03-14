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

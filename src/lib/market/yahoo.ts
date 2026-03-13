import YahooFinance from "yahoo-finance2"

// yahoo-finance2 v3 requires instantiation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getQuote(symbol: string) {
  const result: any = await yahooFinance.quote(symbol)
  if (!result) {
    return {
      symbol,
      shortName: symbol,
      regularMarketPrice: 0, regularMarketChange: 0, regularMarketChangePercent: 0,
      regularMarketPreviousClose: 0, regularMarketOpen: 0, regularMarketDayHigh: 0,
      regularMarketDayLow: 0, regularMarketVolume: 0, marketCap: 0,
      fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0, currency: "USD",
    }
  }
  return {
    symbol: result.symbol ?? symbol,
    shortName: result.shortName ?? result.symbol ?? symbol,
    regularMarketPrice: result.regularMarketPrice ?? 0,
    regularMarketChange: result.regularMarketChange ?? 0,
    regularMarketChangePercent: result.regularMarketChangePercent ?? 0,
    regularMarketPreviousClose: result.regularMarketPreviousClose ?? 0,
    regularMarketOpen: result.regularMarketOpen ?? 0,
    regularMarketDayHigh: result.regularMarketDayHigh ?? 0,
    regularMarketDayLow: result.regularMarketDayLow ?? 0,
    regularMarketVolume: result.regularMarketVolume ?? 0,
    marketCap: result.marketCap ?? 0,
    fiftyTwoWeekHigh: result.fiftyTwoWeekHigh ?? 0,
    fiftyTwoWeekLow: result.fiftyTwoWeekLow ?? 0,
    currency: result.currency ?? "USD",
  }
}

export async function getMultipleQuotes(symbols: string[]) {
  const results = await Promise.all(symbols.map((s) => getQuote(s)))
  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getChart(symbol: string, period1: string, interval: string = "1d") {
  const result: any = await yahooFinance.chart(symbol, {
    period1,
    interval: interval as "1d" | "1wk" | "1mo" | "5m" | "15m" | "1h",
  })

  return (result.quotes ?? []).map((q: any) => ({
    time: Math.floor(new Date(q.date).getTime() / 1000),
    open: q.open ?? 0,
    high: q.high ?? 0,
    low: q.low ?? 0,
    close: q.close ?? 0,
    volume: q.volume ?? 0,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function searchSymbols(query: string) {
  const result: any = await yahooFinance.search(query, { quotesCount: 8 })
  return (result.quotes ?? [])
    .filter((q: any) => q.isYahooFinance)
    .map((q: any) => ({
      symbol: q.symbol as string,
      shortName: (q.shortname as string) ?? (q.symbol as string),
      exchange: (q.exchange as string) ?? "",
      type: (q.quoteType as string) ?? "",
    }))
}

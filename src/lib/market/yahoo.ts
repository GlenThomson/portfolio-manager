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
export async function getChart(symbol: string, period1: string, interval: string = "1d", period2?: string) {
  const opts: any = {
    period1,
    interval: interval as "1d" | "1wk" | "1mo" | "5m" | "15m" | "1h",
  }
  if (period2) opts.period2 = period2
  const result: any = await yahooFinance.chart(symbol, opts)

  const isIntraday = ["1m", "2m", "5m", "15m", "30m", "60m", "1h"].includes(interval)

  return (result.quotes ?? [])
    .filter((q: any) => {
      // Remove candles with null/zero OHLC
      if (q.open == null || q.high == null || q.low == null || q.close == null) return false
      if (q.open <= 0 || q.high <= 0 || q.low <= 0 || q.close <= 0) return false
      // For intraday: remove extended-hours candles with zero volume (garbage high/low data)
      if (isIntraday && (q.volume == null || q.volume <= 0)) return false
      return true
    })
    .map((q: any) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume ?? 0,
    }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getQuoteSummary(symbol: string) {
  const result: any = await yahooFinance.quoteSummary(symbol, {
    modules: ["summaryDetail", "defaultKeyStatistics", "financialData"],
  })

  const sd = result.summaryDetail ?? {}
  const ks = result.defaultKeyStatistics ?? {}
  const fd = result.financialData ?? {}

  return {
    marketCap: sd.marketCap ?? 0,
    trailingPE: sd.trailingPE ?? null,
    forwardPE: ks.forwardPE ?? sd.forwardPE ?? null,
    eps: ks.trailingEps ?? fd.earningsPerShare ?? null,
    dividendYield: sd.dividendYield ?? null,
    fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? 0,
    fiftyTwoWeekLow: sd.fiftyTwoWeekLow ?? 0,
    averageVolume: sd.averageVolume ?? 0,
    beta: sd.beta ?? ks.beta ?? null,
    priceToBook: ks.priceToBook ?? null,
    priceToSalesTrailing12Months: sd.priceToSalesTrailing12Months ?? null,
    profitMargins: ks.profitMargins ?? fd.profitMargins ?? null,
    returnOnEquity: fd.returnOnEquity ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getNews(symbol: string) {
  const result: any = await yahooFinance.search(symbol, {
    newsCount: 10,
    quotesCount: 0,
  })

  return (result.news ?? []).map((item: any) => ({
    title: item.title ?? "",
    publisher: item.publisher ?? "",
    link: item.link ?? "",
    publishedAt: item.providerPublishTime
      ? new Date(item.providerPublishTime * 1000).toISOString()
      : "",
    thumbnail: item.thumbnail?.resolutions?.[0]?.url ?? null,
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

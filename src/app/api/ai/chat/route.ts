import { streamText, tool } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { systemPrompt } from "@/lib/ai/system-prompt"
import { getQuote, searchSymbols, getChart, getNews as getYahooNews } from "@/lib/market/yahoo"
import {
  computeRSI,
  computeMACD,
  computeSMA,
  computeEMA,
  computeBollingerBands,
  computeATR,
} from "@/lib/market/technicals"
import {
  getCompanyNews,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"
import { getFilings, getFilingDocument } from "@/lib/market/edgar"
import { db } from "@/lib/db"
import {
  portfolios,
  portfolioPositions,
  watchlists,
  transactions,
} from "@/lib/db/schema"
import { getServerUserId } from "@/lib/supabase/server"
import YahooFinance from "yahoo-finance2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = new (YahooFinance as any)({ suppressNotices: ["yahooSurvey"] })

// Gemini via OpenAI-compatible endpoint (free tier, 1M context, solid tool calling)
// Falls back to Groq if GOOGLE_GENERATIVE_AI_API_KEY is not set
const gemini = createOpenAICompatible({
  name: "gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  headers: {
    Authorization: `Bearer ${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
  },
})

const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  headers: {
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
  },
})

const useGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages } = await req.json()

  // Authenticate the user for tools that need user data
  let userId: string
  try {
    userId = await getServerUserId()
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const result = await streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: useGemini
      ? gemini.chatModel("gemini-2.5-flash") as any
      : groq.chatModel("llama-3.3-70b-versatile") as any,
    system: systemPrompt,
    messages,
    tools: {
      getQuote: tool({
        description: "Get a real-time stock quote for a given symbol",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const quote = await getQuote(symbol.toUpperCase())
            return quote
          } catch {
            return { error: `Could not fetch quote for ${symbol}` }
          }
        },
      }),

      getPortfolio: tool({
        description:
          "Fetch the authenticated user's portfolios with their positions, quantities, average costs, and current values",
        parameters: z.object({
          portfolioId: z
            .string()
            .optional()
            .describe("Optional specific portfolio ID to fetch"),
        }),
        execute: async ({ portfolioId }) => {
          try {
            // Fetch portfolios for this user
            const portfolioFilter = portfolioId
              ? and(eq(portfolios.userId, userId), eq(portfolios.id, portfolioId))
              : eq(portfolios.userId, userId)

            const userPortfolios = await db
              .select()
              .from(portfolios)
              .where(portfolioFilter)

            if (userPortfolios.length === 0) {
              return { portfolios: [], message: "No portfolios found" }
            }

            // Fetch positions for all user portfolios
            const positions = await db
              .select()
              .from(portfolioPositions)
              .where(eq(portfolioPositions.userId, userId))

            // Fetch current prices for all unique symbols
            const symbols = Array.from(new Set(positions.map((p) => p.symbol)))
            const quotes = await Promise.all(
              symbols.map(async (s) => {
                try {
                  return await getQuote(s)
                } catch {
                  return null
                }
              })
            )
            const priceMap = new Map<string, number>()
            quotes.forEach((q) => {
              if (q) priceMap.set(q.symbol, q.regularMarketPrice)
            })

            // Build portfolio response with enriched position data
            const result = userPortfolios.map((portfolio) => {
              const portfolioPositionsList = positions
                .filter((p) => p.portfolioId === portfolio.id)
                .map((p) => {
                  const qty = Number(p.quantity)
                  const avgCost = Number(p.averageCost)
                  const currentPrice = priceMap.get(p.symbol) ?? 0
                  const marketValue = qty * currentPrice
                  const costBasis = qty * avgCost
                  const unrealizedPnl = marketValue - costBasis
                  const unrealizedPnlPct =
                    costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0

                  return {
                    symbol: p.symbol,
                    quantity: qty,
                    averageCost: avgCost,
                    currentPrice,
                    marketValue,
                    costBasis,
                    unrealizedPnl,
                    unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
                    assetType: p.assetType,
                  }
                })

              const totalValue = portfolioPositionsList.reduce(
                (sum, p) => sum + p.marketValue,
                0
              )
              const totalCost = portfolioPositionsList.reduce(
                (sum, p) => sum + p.costBasis,
                0
              )

              return {
                id: portfolio.id,
                name: portfolio.name,
                currency: portfolio.currency,
                isPaper: portfolio.isPaper,
                positions: portfolioPositionsList,
                totalValue,
                totalCost,
                totalPnl: totalValue - totalCost,
                totalPnlPct:
                  totalCost > 0
                    ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100
                    : 0,
              }
            })

            return { portfolios: result }
          } catch (error) {
            return { error: `Failed to fetch portfolio data: ${String(error)}` }
          }
        },
      }),

      getWatchlist: tool({
        description: "Fetch the authenticated user's watchlist symbols",
        parameters: z.object({}),
        execute: async () => {
          try {
            const userWatchlists = await db
              .select()
              .from(watchlists)
              .where(eq(watchlists.userId, userId))

            if (userWatchlists.length === 0) {
              return { watchlists: [], message: "No watchlists found" }
            }

            return {
              watchlists: userWatchlists.map((w) => ({
                id: w.id,
                name: w.name,
                symbols: w.symbols,
              })),
            }
          } catch (error) {
            return { error: `Failed to fetch watchlists: ${String(error)}` }
          }
        },
      }),

      analyzeStock: tool({
        description:
          "Get comprehensive stock analysis including fundamentals like P/E ratio, market cap, 52-week range, volume, beta, EPS, and dividend yield",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol to analyze (e.g. AAPL)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()

            // Fetch quote and summary data in parallel
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [quote, summaryResult]: [any, any] = await Promise.all([
              getQuote(upperSymbol),
              yahooFinance.quoteSummary(upperSymbol, {
                modules: [
                  "summaryDetail",
                  "defaultKeyStatistics",
                  "financialData",
                  "earningsTrend",
                ],
              }),
            ])

            const summary = summaryResult?.summaryDetail ?? {}
            const keyStats = summaryResult?.defaultKeyStatistics ?? {}
            const financialData = summaryResult?.financialData ?? {}

            return {
              symbol: quote.symbol,
              shortName: quote.shortName,
              currentPrice: quote.regularMarketPrice,
              change: quote.regularMarketChange,
              changePercent: quote.regularMarketChangePercent,
              open: quote.regularMarketOpen,
              dayHigh: quote.regularMarketDayHigh,
              dayLow: quote.regularMarketDayLow,
              previousClose: quote.regularMarketPreviousClose,
              volume: quote.regularMarketVolume,
              marketCap: quote.marketCap,
              fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
              fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
              peRatio: summary.trailingPE ?? keyStats.trailingPE ?? null,
              forwardPE: summary.forwardPE ?? keyStats.forwardPE ?? null,
              eps: keyStats.trailingEps ?? null,
              beta: keyStats.beta ?? summary.beta ?? null,
              dividendYield: summary.dividendYield
                ? Math.round(summary.dividendYield * 10000) / 100
                : null,
              dividendRate: summary.dividendRate ?? null,
              profitMargin: financialData.profitMargins ?? null,
              revenueGrowth: financialData.revenueGrowth ?? null,
              targetMeanPrice: financialData.targetMeanPrice ?? null,
              recommendationKey: financialData.recommendationKey ?? null,
              currency: quote.currency,
            }
          } catch {
            return { error: `Could not analyze ${symbol}` }
          }
        },
      }),

      searchStocks: tool({
        description:
          "Search for stocks by name or keyword. Returns matching symbols with names and exchanges.",
        parameters: z.object({
          query: z
            .string()
            .describe("Search query — company name, keyword, or partial symbol"),
        }),
        execute: async ({ query }) => {
          try {
            const results = await searchSymbols(query)
            return { results }
          } catch {
            return { error: `Search failed for "${query}"` }
          }
        },
      }),

      getPositionDetail: tool({
        description:
          "Get detailed info about the user's position for a specific stock symbol, including quantity, average cost, current price, P&L, and transaction history",
        parameters: z.object({
          symbol: z
            .string()
            .describe("The stock ticker symbol to look up in the user's positions"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()

            // Fetch positions for this symbol
            const userPositions = await db
              .select()
              .from(portfolioPositions)
              .where(
                and(
                  eq(portfolioPositions.userId, userId),
                  eq(portfolioPositions.symbol, upperSymbol)
                )
              )

            if (userPositions.length === 0) {
              return {
                symbol: upperSymbol,
                found: false,
                message: `No position found for ${upperSymbol}`,
              }
            }

            // Fetch current quote
            const quote = await getQuote(upperSymbol)

            // Fetch transaction history for this symbol
            const txHistory = await db
              .select()
              .from(transactions)
              .where(
                and(
                  eq(transactions.userId, userId),
                  eq(transactions.symbol, upperSymbol)
                )
              )

            // Fetch portfolio names for context
            const userPortfolios = await db
              .select({ id: portfolios.id, name: portfolios.name })
              .from(portfolios)
              .where(eq(portfolios.userId, userId))
            const portfolioNameMap = new Map(
              userPortfolios.map((p) => [p.id, p.name])
            )

            const positions = userPositions.map((p) => {
              const qty = Number(p.quantity)
              const avgCost = Number(p.averageCost)
              const currentPrice = quote.regularMarketPrice
              const marketValue = qty * currentPrice
              const costBasis = qty * avgCost
              const unrealizedPnl = marketValue - costBasis
              const unrealizedPnlPct =
                costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0

              return {
                portfolioId: p.portfolioId,
                portfolioName: portfolioNameMap.get(p.portfolioId) ?? "Unknown",
                quantity: qty,
                averageCost: avgCost,
                currentPrice,
                marketValue,
                costBasis,
                unrealizedPnl,
                unrealizedPnlPct: Math.round(unrealizedPnlPct * 100) / 100,
                assetType: p.assetType,
                openedAt: p.openedAt,
                closedAt: p.closedAt,
              }
            })

            const transactionHistory = txHistory.map((tx) => ({
              action: tx.action,
              quantity: Number(tx.quantity),
              price: Number(tx.price),
              fees: Number(tx.fees),
              executedAt: tx.executedAt,
              portfolioName: portfolioNameMap.get(tx.portfolioId) ?? "Unknown",
            }))

            return {
              symbol: upperSymbol,
              found: true,
              currentPrice: quote.regularMarketPrice,
              positions,
              transactions: transactionHistory,
            }
          } catch (error) {
            return {
              error: `Failed to fetch position detail for ${symbol}: ${String(error)}`,
            }
          }
        },
      }),

      getTechnicals: tool({
        description:
          "Get technical analysis indicators for a stock symbol including RSI, MACD, SMA, EMA, Bollinger Bands, ATR, and volume analysis. Use this when users ask about overbought/oversold conditions, trends, momentum, or technical analysis.",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
          interval: z
            .string()
            .optional()
            .describe("Candle interval — default '1d'. Options: '1d', '1wk', '1h', '5m'"),
        }),
        execute: async ({ symbol, interval = "1d" }) => {
          try {
            const upperSymbol = symbol.toUpperCase()

            // Fetch ~200 candles of OHLCV data
            const now = new Date()
            let period1: string
            if (interval === "1d") {
              const d = new Date(now)
              d.setDate(d.getDate() - 300) // ~200 trading days
              period1 = d.toISOString().split("T")[0]
            } else if (interval === "1wk") {
              const d = new Date(now)
              d.setDate(d.getDate() - 7 * 210)
              period1 = d.toISOString().split("T")[0]
            } else if (interval === "1h") {
              const d = new Date(now)
              d.setDate(d.getDate() - 30) // ~200 hourly candles
              period1 = d.toISOString().split("T")[0]
            } else {
              // 5m — last 5 days
              const d = new Date(now)
              d.setDate(d.getDate() - 5)
              period1 = d.toISOString().split("T")[0]
            }

            const candles = await getChart(upperSymbol, period1, interval)

            if (!candles || candles.length < 50) {
              return { error: `Insufficient data for ${upperSymbol} — only ${candles?.length ?? 0} candles available` }
            }

            const closes = candles.map((c: { close: number }) => c.close)
            const highs = candles.map((c: { high: number }) => c.high)
            const lows = candles.map((c: { low: number }) => c.low)
            const volumes = candles.map((c: { volume: number }) => c.volume)
            const lastIdx = closes.length - 1
            const lastPrice = closes[lastIdx]
            const lastVolume = volumes[lastIdx]

            // Compute indicators
            const rsiValues = computeRSI(closes, 14)
            const rsiValue = rsiValues[lastIdx]
            const rsiInterpretation =
              rsiValue >= 70 ? "overbought" : rsiValue <= 30 ? "oversold" : "neutral"

            const macdResult = computeMACD(closes)
            const macdValue = macdResult.macd[lastIdx]
            const macdSignal = macdResult.signal[lastIdx]
            const macdHistogram = macdResult.histogram[lastIdx]
            const macdInterpretation =
              isNaN(macdHistogram) ? "neutral" :
              macdHistogram > 0 ? "bullish" : macdHistogram < 0 ? "bearish" : "neutral"

            const sma20 = computeSMA(closes, 20)
            const sma50 = computeSMA(closes, 50)
            const sma200 = computeSMA(closes, 200)

            const ema12 = computeEMA(closes, 12)
            const ema26 = computeEMA(closes, 26)

            const bb = computeBollingerBands(closes, 20, 2)
            const bbUpper = bb.upper[lastIdx]
            const bbMiddle = bb.middle[lastIdx]
            const bbLower = bb.lower[lastIdx]
            const percentB =
              bbUpper !== bbLower && !isNaN(bbUpper) && !isNaN(bbLower)
                ? (lastPrice - bbLower) / (bbUpper - bbLower)
                : NaN
            const bbInterpretation = isNaN(percentB)
              ? "neutral"
              : percentB > 1
                ? "overbought — price above upper band"
                : percentB < 0
                  ? "oversold — price below lower band"
                  : percentB > 0.8
                    ? "approaching overbought"
                    : percentB < 0.2
                      ? "approaching oversold"
                      : "neutral — within bands"

            const atrValues = computeATR(highs, lows, closes, 14)
            const atrValue = atrValues[lastIdx]
            const atrPercent = !isNaN(atrValue) ? (atrValue / lastPrice) * 100 : NaN

            // Volume analysis: compare current volume to 20-day average
            const recentVolumes = volumes.slice(Math.max(0, lastIdx - 19), lastIdx + 1)
            const avgVolume20 =
              recentVolumes.length > 0
                ? recentVolumes.reduce((a: number, b: number) => a + b, 0) / recentVolumes.length
                : 0
            const volumeRatio = avgVolume20 > 0 ? lastVolume / avgVolume20 : 0
            const volumeInterpretation =
              volumeRatio > 1.5
                ? "significantly above average"
                : volumeRatio > 1.1
                  ? "above average"
                  : volumeRatio < 0.5
                    ? "significantly below average"
                    : volumeRatio < 0.9
                      ? "below average"
                      : "near average"

            const sma200Value = sma200[lastIdx]

            const round = (v: number, decimals = 2) =>
              isNaN(v) ? null : Math.round(v * 10 ** decimals) / 10 ** decimals

            return {
              symbol: upperSymbol,
              interval,
              lastPrice: round(lastPrice),
              lastVolume,
              candleCount: candles.length,
              rsi: {
                value: round(rsiValue),
                interpretation: rsiInterpretation,
              },
              macd: {
                macd: round(macdValue, 4),
                signal: round(macdSignal, 4),
                histogram: round(macdHistogram, 4),
                interpretation: macdInterpretation,
              },
              sma: {
                sma20: round(sma20[lastIdx]),
                sma50: round(sma50[lastIdx]),
                sma200: round(sma200Value),
                priceVs200SMA:
                  isNaN(sma200Value) ? "insufficient data" :
                  lastPrice > sma200Value ? "above" : "below",
              },
              ema: {
                ema12: round(ema12[lastIdx]),
                ema26: round(ema26[lastIdx]),
              },
              bollingerBands: {
                upper: round(bbUpper),
                middle: round(bbMiddle),
                lower: round(bbLower),
                percentB: round(percentB),
                interpretation: bbInterpretation,
              },
              atr: {
                value: round(atrValue),
                percentOfPrice: round(atrPercent),
              },
              volumeAnalysis: {
                current: lastVolume,
                avg20: round(avgVolume20, 0),
                ratio: round(volumeRatio),
                interpretation: volumeInterpretation,
              },
            }
          } catch (error) {
            return { error: `Failed to compute technicals for ${symbol}: ${String(error)}` }
          }
        },
      }),

      getFilings: tool({
        description:
          "Fetch a list of recent SEC filings (10-K, 10-Q, 8-K, etc.) for a given stock symbol. Use this to find what filings are available before reading one.",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
          filingType: z
            .string()
            .optional()
            .describe("Optional filing type filter: 10-K, 10-Q, 8-K, etc."),
          count: z
            .number()
            .optional()
            .describe("Number of filings to return (default 10)"),
        }),
        execute: async ({ symbol, filingType, count }) => {
          try {
            const filings = await getFilings(
              symbol.toUpperCase(),
              filingType,
              count ?? 10
            )
            return { symbol: symbol.toUpperCase(), filings }
          } catch {
            return { error: `Could not fetch filings for ${symbol}` }
          }
        },
      }),

      getNews: tool({
        description:
          "Fetch the latest news headlines and summaries for a stock symbol. Uses Finnhub if available, otherwise Yahoo Finance.",
        parameters: z.object({
          symbol: z
            .string()
            .describe("The stock ticker symbol to get news for (e.g. AAPL)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()

            // Try Finnhub first
            if (isFinnhubConfigured()) {
              try {
                const articles = await getCompanyNews(upperSymbol, 7)
                if (articles.length > 0) {
                  return {
                    symbol: upperSymbol,
                    source: "finnhub",
                    articles: articles.slice(0, 10).map((a) => ({
                      headline: a.headline,
                      summary: a.summary || "",
                      source: a.source,
                      url: a.url,
                      datetime: new Date(a.datetime * 1000).toISOString(),
                    })),
                  }
                }
              } catch {
                // Fall through to Yahoo
              }
            }

            // Fallback to Yahoo
            const yahooNews = await getYahooNews(upperSymbol)
            return {
              symbol: upperSymbol,
              source: "yahoo",
              articles: yahooNews.slice(0, 10).map((a: { title: string; publisher: string; link: string; publishedAt: string }) => ({
                headline: a.title,
                source: a.publisher,
                url: a.link,
                datetime: a.publishedAt,
              })),
            }
          } catch {
            return { error: `Could not fetch news for ${symbol}` }
          }
        },
      }),

      analyzeSentiment: tool({
        description:
          "Analyze news sentiment for a stock. Fetches recent news headlines and returns an AI-ready sentiment assessment with key themes. The AI should interpret the returned headlines and provide its own bullish/bearish/neutral assessment.",
        parameters: z.object({
          symbol: z
            .string()
            .describe("The stock ticker symbol to analyze sentiment for (e.g. AAPL)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()
            let headlines: string[] = []

            // Try Finnhub first
            if (isFinnhubConfigured()) {
              try {
                const articles = await getCompanyNews(upperSymbol, 7)
                headlines = articles
                  .slice(0, 15)
                  .map((a) => a.headline)
                  .filter(Boolean)
              } catch {
                // Fall through to Yahoo
              }
            }

            // Fallback to Yahoo
            if (headlines.length === 0) {
              const yahooNews = await getYahooNews(upperSymbol)
              headlines = yahooNews
                .slice(0, 15)
                .map((a: { title: string }) => a.title)
                .filter(Boolean)
            }

            if (headlines.length === 0) {
              return {
                symbol: upperSymbol,
                error: "No recent news found to analyze sentiment",
              }
            }

            // Return headlines for the AI to analyze
            return {
              symbol: upperSymbol,
              headlineCount: headlines.length,
              headlines,
              instruction:
                "Based on these headlines, provide your sentiment assessment with: overallSentiment (bullish/bearish/neutral), confidence (low/medium/high), and keyThemes (list of 3-5 key themes from the headlines).",
            }
          } catch {
            return { error: `Could not analyze sentiment for ${symbol}` }
          }
        },
      }),

      readFiling: tool({
        description:
          "Fetch and read the text content of a specific SEC filing. Use getFilings first to find the accession number and document name. Returns truncated text that you can summarise for the user.",
        parameters: z.object({
          accessionNumber: z
            .string()
            .describe(
              "The accession number of the filing (e.g. 0000320193-24-000123)"
            ),
          primaryDocument: z
            .string()
            .describe(
              "The primary document filename (e.g. aapl-20240928.htm)"
            ),
        }),
        execute: async ({ accessionNumber, primaryDocument }) => {
          try {
            const content = await getFilingDocument(
              accessionNumber,
              primaryDocument
            )
            // Truncate to 30k characters for AI context
            const truncated =
              content.length > 30000
                ? content.slice(0, 30000) +
                  "\n\n[Truncated at 30,000 characters — full filing is longer]"
                : content
            return {
              accessionNumber,
              primaryDocument,
              contentLength: content.length,
              content: truncated,
            }
          } catch {
            return {
              error: `Could not read filing ${accessionNumber}/${primaryDocument}`,
            }
          }
        },
      }),
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}

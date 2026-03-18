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
  getEarnings,
  getEarningsCalendar,
  getRecommendationTrends,
  getPriceTarget,
  getInsiderTransactions,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"
import { getFilings, getFilingDocument } from "@/lib/market/edgar"
import {
  scanTopGainers,
  scanTopLosers,
  scanUnusualVolume,
  scanSectorPerformance,
  scan52WeekHighLow,
} from "@/lib/market/scanner"
import { getWSBTrending, getStockMentions, getStockSentiment } from "@/lib/market/reddit"
import { getStockScore } from "@/lib/scoring"
import { getMacroSnapshot, isFredConfigured, getFredSeries, FRED_SERIES } from "@/lib/market/fred"
import { getPutCallSnapshot } from "@/lib/market/cboe"
import { compareFilings } from "@/lib/analysis/filing-comparison"
import { computeHRPAllocation } from "@/lib/optimization/hrp"
import { computeKellySize } from "@/lib/optimization/kelly"
import { detectMarketRegime } from "@/lib/optimization/regime"
import { db } from "@/lib/db"
import {
  portfolios,
  portfolioPositions,
  watchlists,
  transactions,
} from "@/lib/db/schema"
import { getServerUserId } from "@/lib/supabase/server"
import { analyzePortfolioHealth } from "@/lib/scoring/portfolio-health"
import { isNull } from "drizzle-orm"
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
          "Fetch and read the full text content of a specific SEC filing. Use getFilings first to find the accession number, document name, and CIK. Returns the filing text (up to 300k characters) for you to analyse and summarise.",
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
          symbol: z
            .string()
            .optional()
            .describe(
              "The stock ticker symbol — used to resolve the correct company CIK for the filing URL"
            ),
        }),
        execute: async ({ accessionNumber, primaryDocument, symbol }) => {
          try {
            const content = await getFilingDocument(
              accessionNumber,
              primaryDocument,
              symbol
            )
            const truncated =
              content.length > 300000
                ? content.slice(0, 300000) +
                  "\n\n[Truncated at 300,000 characters — full filing is " + content.length.toLocaleString() + " characters]"
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

      compareFilings: tool({
        description:
          "Compare a company's two most recent annual (10-K) or quarterly (10-Q) SEC filings side by side. Extracts Risk Factors, MD&A, and Business sections from both filings and returns them for analysis. Use when users ask to compare filings, check for risk changes, or analyze trajectory shifts between reporting periods.",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
          filingType: z
            .enum(["10-K", "10-Q"])
            .optional()
            .describe("Filing type to compare — '10-K' for annual (default), '10-Q' for quarterly"),
        }),
        execute: async ({ symbol, filingType = "10-K" }) => {
          try {
            const result = await compareFilings(symbol.toUpperCase(), filingType)
            return result
          } catch (error) {
            return { error: `Could not compare filings for ${symbol}: ${String(error)}` }
          }
        },
      }),

      scanMarket: tool({
        description:
          "Scan the market for unusual activity and opportunities. Can find top gainers, top losers, unusual volume, sector performance, and stocks near 52-week highs or lows.",
        parameters: z.object({
          scanType: z
            .enum([
              "unusual_volume",
              "top_gainers",
              "top_losers",
              "sector_performance",
              "52week_highs_lows",
            ])
            .describe("The type of market scan to perform"),
          count: z
            .number()
            .optional()
            .describe("Number of results to return (default 10, max 50)"),
        }),
        execute: async ({ scanType, count }) => {
          try {
            const n = Math.min(count ?? 10, 50)
            switch (scanType) {
              case "top_gainers":
                return { scanType, results: await scanTopGainers(n) }
              case "top_losers":
                return { scanType, results: await scanTopLosers(n) }
              case "unusual_volume":
                return { scanType, results: await scanUnusualVolume(n) }
              case "sector_performance":
                return { scanType, results: await scanSectorPerformance() }
              case "52week_highs_lows":
                return { scanType, results: await scan52WeekHighLow() }
              default:
                return { error: `Unknown scan type: ${scanType}` }
            }
          } catch {
            return { error: `Market scan failed for ${scanType}` }
          }
        },
      }),

      getEarnings: tool({
        description:
          "Get earnings history and upcoming earnings for a stock. Returns past EPS actuals vs estimates with surprise data. Without a symbol, returns upcoming earnings calendar for the next 2 weeks.",
        parameters: z.object({
          symbol: z
            .string()
            .optional()
            .describe("Stock ticker symbol (e.g. AAPL). Omit for upcoming earnings calendar."),
        }),
        execute: async ({ symbol }) => {
          try {
            if (symbol) {
              const upperSymbol = symbol.toUpperCase()
              const earnings = await getEarnings(upperSymbol)
              return { symbol: upperSymbol, earnings }
            }
            // Default: next 2 weeks calendar
            const now = new Date()
            const twoWeeks = new Date(now)
            twoWeeks.setDate(twoWeeks.getDate() + 14)
            const from = now.toISOString().split("T")[0]
            const to = twoWeeks.toISOString().split("T")[0]
            const events = await getEarningsCalendar(from, to)
            return { from, to, events }
          } catch {
            return { error: `Could not fetch earnings data${symbol ? ` for ${symbol}` : ""}` }
          }
        },
      }),

      getAnalystRatings: tool({
        description:
          "Get analyst buy/hold/sell recommendations and price targets for a stock. Returns recommendation trend history and consensus price target (high, low, mean, median).",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()
            const [recommendations, priceTarget] = await Promise.all([
              getRecommendationTrends(upperSymbol),
              getPriceTarget(upperSymbol),
            ])
            return { symbol: upperSymbol, recommendations, priceTarget }
          } catch {
            return { error: `Could not fetch analyst ratings for ${symbol}` }
          }
        },
      }),

      getInsiderTrading: tool({
        description:
          "Get recent insider buy/sell transactions for a stock. Shows who bought or sold, how many shares, at what price, and when. Transaction codes: P = Purchase, S = Sale, M = Option Exercise.",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const upperSymbol = symbol.toUpperCase()
            const transactions = await getInsiderTransactions(upperSymbol)
            return {
              symbol: upperSymbol,
              transactions: transactions.slice(0, 20),
            }
          } catch {
            return { error: `Could not fetch insider trading data for ${symbol}` }
          }
        },
      }),

      getRedditSentiment: tool({
        description:
          "Get Reddit sentiment data for a stock or see what's trending on r/wallstreetbets. Without a symbol, returns trending WSB stocks. With a symbol, returns sentiment scores and mention counts.",
        parameters: z.object({
          symbol: z
            .string()
            .optional()
            .describe("Optional stock ticker — omit to get WSB trending list"),
          type: z
            .enum(["trending", "mentions"])
            .optional()
            .describe(
              "Type of data: 'trending' for WSB trending stocks, 'mentions' for top mentioned stocks across all reddit. Defaults to 'trending'."
            ),
        }),
        execute: async ({ symbol, type }) => {
          try {
            if (symbol) {
              const sentiment = await getStockSentiment(symbol.toUpperCase())
              return sentiment
            }
            if (type === "mentions") {
              const mentions = await getStockMentions()
              return { topMentions: mentions.slice(0, 20) }
            }
            // Default: WSB trending
            const trending = await getWSBTrending(20)
            return { trending }
          } catch {
            return { error: "Could not fetch Reddit sentiment data" }
          }
        },
      }),

      deepResearch: tool({
        description:
          "Trigger a comprehensive deep research process for a stock. Returns a research plan that guides multi-step analysis using all available tools. Use this when the user asks to 'research' a stock or wants a full investment thesis.",
        parameters: z.object({
          symbol: z
            .string()
            .describe("The stock ticker symbol to research (e.g. NVDA, AAPL)"),
        }),
        execute: async ({ symbol }) => {
          const upperSymbol = symbol.toUpperCase()
          return {
            type: "research_plan",
            symbol: upperSymbol,
            instruction: `Execute a comprehensive research report for ${upperSymbol}. Follow these steps in order, calling each tool:

1. Call getQuote for ${upperSymbol} — get the current price, change, volume
2. Call analyzeStock for ${upperSymbol} — get fundamentals (P/E, market cap, EPS, revenue growth, dividend yield, beta, 52-week range)
3. Call searchStocks for "${upperSymbol}" — confirm the full company name and exchange

After gathering all data, synthesize into the structured Research Report format as described in your instructions. Use every piece of data you collected. If any tool call fails, note it in the report and continue with the data you have.`,
            steps: [
              {
                tool: "getQuote",
                args: { symbol: upperSymbol },
                purpose: "Current price and market data",
              },
              {
                tool: "analyzeStock",
                args: { symbol: upperSymbol },
                purpose: "Fundamental analysis and key metrics",
              },
              {
                tool: "searchStocks",
                args: { query: upperSymbol },
                purpose: "Confirm company details and exchange",
              },
            ],
          }
        },
      }),

      getStockScore: tool({
        description:
          "Get a research-backed multi-factor stock score (0-100) with letter grade. Factors: Momentum 30% (price momentum + EPS revisions), Fundamental 30% (P/E, margins, growth, ROE), Technical 20% (RSI, MACD, SMA, Bollinger), Sentiment 10% (news, Reddit contrarian, analyst dispersion, insider activity), Risk 10% (beta, ATR, max drawdown). Returns overall score, grade (A+ to F), 5 sub-scores, key drivers (top 3 reasons), signal freshness per factor, and detailed explanations.",
        parameters: z.object({
          symbol: z
            .string()
            .describe("The stock ticker symbol to score (e.g. AAPL, MSFT)"),
        }),
        execute: async ({ symbol }) => {
          try {
            const score = await getStockScore(symbol.toUpperCase())
            return score
          } catch {
            return { error: `Could not compute score for ${symbol}` }
          }
        },
      }),

      getMacroIndicators: tool({
        description:
          "Get macroeconomic indicators including yield curve, VIX, Fed funds rate, unemployment, CPI, consumer sentiment, Treasury yields, and put/call ratios. Use this when users ask about macro conditions, the economy, interest rates, market fear/greed, or want context for investment decisions.",
        parameters: z.object({
          type: z
            .enum(["snapshot", "series", "putcall"])
            .optional()
            .describe("Type of data: 'snapshot' for all indicators (default), 'series' for a specific FRED series, 'putcall' for options put/call ratios"),
          seriesId: z
            .string()
            .optional()
            .describe("FRED series ID when type='series'. Options: T10Y2Y (yield curve spread), DGS10 (10Y Treasury), DGS2 (2Y Treasury), DFF (Fed funds rate), VIXCLS (VIX), CPIAUCSL (CPI), UNRATE (unemployment), ICSA (initial claims), UMCSENT (consumer sentiment)"),
          limit: z
            .number()
            .optional()
            .describe("Number of observations for series data (default 30, max 500)"),
        }),
        execute: async ({ type = "snapshot", seriesId, limit = 30 }) => {
          try {
            if (type === "series" && seriesId) {
              if (!isFredConfigured()) {
                return { error: "FRED API key not configured. Macro series data unavailable." }
              }
              const data = await getFredSeries(seriesId, Math.min(limit, 500))
              return data
            }

            if (type === "putcall") {
              const data = await getPutCallSnapshot()
              return data
            }

            // Full snapshot
            const [macroData, putCallData] = await Promise.allSettled([
              getMacroSnapshot(),
              getPutCallSnapshot(),
            ])

            const snapshot = {
              fredConfigured: isFredConfigured(),
              fred: macroData.status === "fulfilled" ? macroData.value : null,
              putCall: putCallData.status === "fulfilled" ? putCallData.value : null,
              availableSeries: Object.entries(FRED_SERIES).map(([id, title]) => ({ id, title })),
            }

            return snapshot
          } catch {
            return { error: "Failed to fetch macro indicators" }
          }
        },
      }),

      getPortfolioHealth: tool({
        description:
          "Analyze the health and diversification of a user's portfolio. Returns an overall score, grade, sector allocation, concentration warnings, risk metrics (beta), and actionable suggestions. Use this when users ask about portfolio health, diversification, risk, or how balanced their portfolio is.",
        parameters: z.object({
          portfolioId: z
            .string()
            .optional()
            .describe("Optional portfolio ID. If not provided, uses the first portfolio."),
        }),
        execute: async ({ portfolioId }) => {
          try {
            // Find the portfolio
            const portfolioFilter = portfolioId
              ? and(eq(portfolios.userId, userId), eq(portfolios.id, portfolioId))
              : eq(portfolios.userId, userId)

            const userPortfolios = await db
              .select()
              .from(portfolios)
              .where(portfolioFilter)

            if (userPortfolios.length === 0) {
              return { error: "No portfolios found" }
            }

            const targetPortfolio = userPortfolios[0]

            // Fetch open positions (exclude cash)
            const positions = await db
              .select()
              .from(portfolioPositions)
              .where(
                and(
                  eq(portfolioPositions.portfolioId, targetPortfolio.id),
                  eq(portfolioPositions.userId, userId),
                  isNull(portfolioPositions.closedAt)
                )
              )

            const stockPositions = positions
              .filter((p) => p.assetType !== "cash")
              .map((p) => ({
                symbol: p.symbol,
                quantity: Number(p.quantity),
                averageCost: Number(p.averageCost),
              }))

            const report = await analyzePortfolioHealth(stockPositions)
            return {
              portfolioName: targetPortfolio.name,
              ...report,
            }
          } catch (error) {
            return { error: `Failed to analyze portfolio health: ${String(error)}` }
          }
        },
      }),

      getOptimalAllocation: tool({
        description:
          "Compute optimal portfolio allocation using Hierarchical Risk Parity (HRP). Analyzes correlations between holdings and suggests risk-balanced weights. Use when users ask 'how should I allocate', 'optimal weights', 'rebalance', or 'risk parity'.",
        parameters: z.object({
          portfolioId: z
            .string()
            .optional()
            .describe("Optional portfolio ID. If not provided, uses the first portfolio."),
        }),
        execute: async ({ portfolioId }) => {
          try {
            const portfolioFilter = portfolioId
              ? and(eq(portfolios.userId, userId), eq(portfolios.id, portfolioId))
              : eq(portfolios.userId, userId)

            const userPortfolios = await db
              .select()
              .from(portfolios)
              .where(portfolioFilter)

            if (userPortfolios.length === 0) {
              return { error: "No portfolios found" }
            }

            const targetPortfolio = userPortfolios[0]

            const positions = await db
              .select()
              .from(portfolioPositions)
              .where(
                and(
                  eq(portfolioPositions.portfolioId, targetPortfolio.id),
                  eq(portfolioPositions.userId, userId),
                  isNull(portfolioPositions.closedAt)
                )
              )

            const stockPositions = positions.filter((p) => p.assetType !== "cash")

            if (stockPositions.length < 2) {
              return { error: "Need at least 2 positions for allocation optimization" }
            }

            // Get current quotes for weights
            const quotes = await Promise.all(
              stockPositions.map(async (p) => {
                try {
                  const q = await getQuote(p.symbol)
                  return { symbol: p.symbol, price: q.regularMarketPrice, qty: Number(p.quantity) }
                } catch {
                  return { symbol: p.symbol, price: Number(p.averageCost), qty: Number(p.quantity) }
                }
              })
            )

            const totalValue = quotes.reduce((s, q) => s + q.price * q.qty, 0)
            const symbols = quotes.map(q => q.symbol)
            const currentWeights = quotes.map(q => totalValue > 0 ? (q.price * q.qty) / totalValue : 0)

            const result = await computeHRPAllocation(symbols, currentWeights)
            return { portfolioName: targetPortfolio.name, ...result }
          } catch (error) {
            return { error: `Failed to compute allocation: ${String(error)}` }
          }
        },
      }),

      getPositionSize: tool({
        description:
          "Calculate optimal position size using Half-Kelly criterion. Based on historical win rate and win/loss ratio. Use when users ask 'how much should I buy', 'position size', 'how much to allocate', or 'Kelly criterion'.",
        parameters: z.object({
          symbol: z.string().describe("The stock ticker symbol (e.g. AAPL, MSFT)"),
          accountSize: z
            .number()
            .optional()
            .describe("Total portfolio value in dollars — used to compute dollar allocation"),
          maxPosition: z
            .number()
            .optional()
            .describe("Maximum position size as fraction (default 0.25 = 25%)"),
        }),
        execute: async ({ symbol, accountSize, maxPosition }) => {
          try {
            const result = await computeKellySize({
              symbol: symbol.toUpperCase(),
              accountSize,
              maxPosition,
            })
            return result
          } catch {
            return { error: `Could not compute position size for ${symbol}` }
          }
        },
      }),

      getMarketRegime: tool({
        description:
          "Detect the current market regime (Risk-On, Risk-Off, Inflationary, or Transitional) using macro indicators. Returns regime classification, confidence level, individual indicator signals, and sector/factor implications. Use when users ask about market conditions, macro outlook, 'what regime are we in', or need context for allocation decisions.",
        parameters: z.object({}),
        execute: async () => {
          try {
            return await detectMarketRegime()
          } catch {
            return { error: "Failed to detect market regime" }
          }
        },
      }),
    },
    maxSteps: 10,
  })

  return result.toDataStreamResponse()
}

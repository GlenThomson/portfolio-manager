import { streamText, tool } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { systemPrompt } from "@/lib/ai/system-prompt"
import { getQuote, searchSymbols, getNews as getYahooNews } from "@/lib/market/yahoo"
import {
  getCompanyNews,
  isFinnhubConfigured,
} from "@/lib/market/finnhub"
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

const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  headers: {
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
  },
})

export const maxDuration = 30

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
    model: groq.chatModel("llama-3.3-70b-versatile") as any,
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
                      summary: a.summary,
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
                summary: "",
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
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}

import { streamText, tool } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { systemPrompt } from "@/lib/ai/system-prompt"
import { getQuote, searchSymbols } from "@/lib/market/yahoo"
import {
  scanTopGainers,
  scanTopLosers,
  scanUnusualVolume,
  scanSectorPerformance,
  scan52WeekHighLow,
} from "@/lib/market/scanner"
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
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}

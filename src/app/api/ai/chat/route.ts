import { streamText, tool } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { systemPrompt } from "@/lib/ai/system-prompt"
import { getQuote } from "@/lib/market/yahoo"

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = await streamText({
    model: anthropic("claude-sonnet-4-20250514"),
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
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}

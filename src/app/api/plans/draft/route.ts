import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { getQuote } from "@/lib/market/yahoo"
import { getCompanyNews, isFinnhubConfigured } from "@/lib/market/finnhub"
import { isValidSymbol } from "@/lib/validation"

export const maxDuration = 30

const gemini = createOpenAICompatible({
  name: "gemini",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
})

const groq = createOpenAICompatible({
  name: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY ?? "",
})

const useGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

interface DraftPlan {
  entry_thesis: string
  target_price: number | null
  target_event: string | null
  stop_price: number | null
  stop_condition: string | null
  review_frequency: "weekly" | "monthly" | "on_earnings" | "on_event"
  reasoning: string
}

/**
 * POST /api/plans/draft { symbol }
 * Returns an AI-drafted plan. Does not persist — UI shows to user for edit/accept.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { symbol } = body as { symbol?: string }
  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "Valid symbol required" }, { status: 400 })
  }
  const sym = symbol!.toUpperCase().trim()

  // Fetch current quote + recent news in parallel
  const quotePromise = getQuote(sym).catch(() => null)
  const newsPromise = isFinnhubConfigured()
    ? getCompanyNews(sym, 14).catch(() => [])
    : Promise.resolve([])

  const [quote, news] = await Promise.all([quotePromise, newsPromise])

  if (!quote || !quote.regularMarketPrice) {
    return NextResponse.json({ error: "Unable to fetch quote for symbol" }, { status: 404 })
  }

  const price = quote.regularMarketPrice
  const high52 = quote.fiftyTwoWeekHigh
  const low52 = quote.fiftyTwoWeekLow
  const pe = quote.trailingPE
  const name = quote.shortName

  const newsList = (news as Array<{ headline: string; summary?: string }>).slice(0, 8)
  const newsText = newsList.length > 0
    ? newsList.map((n, i) => `${i + 1}. ${n.headline}`).join("\n")
    : "No recent news available."

  const prompt = `You are drafting an investment plan for a stock position. Output STRICT JSON matching the schema — no prose, no markdown fences.

CONTEXT
Symbol: ${sym} (${name})
Current price: $${price.toFixed(2)}
52-week range: $${low52.toFixed(2)} – $${high52.toFixed(2)}
Trailing P/E: ${pe ?? "n/a"}

RECENT NEWS (last 14 days):
${newsText}

SCHEMA (output exactly this JSON shape):
{
  "entry_thesis": string,            // 1-2 sentences. Why hold this stock? Based on the context and news.
  "target_price": number | null,     // Price target (absolute USD). Aim for realistic 12-24mo upside. Null if no clear price target.
  "target_event": string | null,     // Catalyst/milestone to watch for (e.g. "Q4 earnings beat", "product launch"). Null if purely price-based.
  "stop_price": number | null,       // Exit stop-loss price. Usually 15-25% below current. Null if thesis-based only.
  "stop_condition": string | null,   // What fundamentally invalidates the thesis (e.g. "Data center revenue growth falls below 30% YoY"). Null if purely price-based.
  "review_frequency": "weekly" | "monthly" | "on_earnings" | "on_event",  // How often to revisit
  "reasoning": string                // 1 short sentence explaining your suggested numbers
}

RULES:
- Thesis must be specific and tied to the company, not generic.
- target_price should be realistic — not moonshot. Round to the nearest dollar.
- stop_price should protect against thesis-invalidation losses, not noise.
- If news is bearish or thin, reflect that honestly in the thesis.
- review_frequency "on_earnings" is good default for most single stocks.

Output JSON now:`

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model: any = useGemini
      ? gemini.chatModel("gemini-2.5-flash")
      : groq.chatModel("llama-3.3-70b-versatile")

    const { text } = await generateText({ model, prompt, temperature: 0.4 })

    // Strip any markdown fences and parse
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim()
    let draft: DraftPlan
    try {
      draft = JSON.parse(cleaned)
    } catch {
      // Try to extract JSON from within the text
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        return NextResponse.json({ error: "AI did not return valid JSON", raw: cleaned }, { status: 502 })
      }
      draft = JSON.parse(match[0])
    }

    // Sanity-check the draft
    if (draft.target_price != null && (draft.target_price < price * 0.3 || draft.target_price > price * 5)) {
      // Silently clamp obviously broken targets
      draft.target_price = Math.round(price * 1.25)
    }
    if (draft.stop_price != null && (draft.stop_price < price * 0.3 || draft.stop_price > price * 1.2)) {
      draft.stop_price = Math.round(price * 0.8 * 100) / 100
    }

    return NextResponse.json({
      symbol: sym,
      currentPrice: price,
      draft,
      provider: useGemini ? "gemini" : "groq",
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error("Plan draft failed:", detail)
    return NextResponse.json({ error: "AI draft failed", detail }, { status: 500 })
  }
}

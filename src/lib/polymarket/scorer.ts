/**
 * AI scoring for Polymarket markets. Takes a batch of filtered markets and
 * asks the AI to score each on 0-100 (edge, catalyst clarity, info availability,
 * time value) plus a thesis + suggested side.
 */
import { generateText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { PolymarketMarket } from "./client"

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
function getModel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useGemini
    ? (gemini.chatModel("gemini-2.5-flash") as any)
    : (groq.chatModel("llama-3.3-70b-versatile") as any)
}

export interface MarketScore {
  marketId: string
  score: number               // 0-100 overall "should I bet?"
  confidence: number          // 0-100 AI's confidence in its assessment
  thesis: string              // short reason
  suggestedSide: "yes" | "no" | null
  edgePct: number             // AI fair probability - market price, in percentage points
  concerns: string            // what could go wrong
}

/**
 * Score a batch of markets in a single AI call. Returns scores keyed by marketId.
 */
export async function scoreMarkets(markets: PolymarketMarket[]): Promise<Map<string, MarketScore>> {
  const out = new Map<string, MarketScore>()
  if (markets.length === 0) return out

  // Cap batch size to keep prompts manageable
  const batch = markets.slice(0, 20)
  const numbered = batch.map((m, i) => {
    const days = m.endDate ? Math.round((Date.parse(m.endDate) - Date.now()) / 86400_000) : null
    return `${i + 1}. [${m.category ?? "?"}] "${m.question}" — YES priced ${(m.yesPrice * 100).toFixed(0)}% · vol24h $${Math.round(m.volume24h / 1000)}k · liquidity $${Math.round(m.liquidity / 1000)}k${days != null ? ` · ${days}d to resolution` : ""}`
  }).join("\n")

  const prompt = `You are evaluating Polymarket prediction markets for a sophisticated investor. For each market, decide:
1. Is the market mispriced? Compare YES priced probability vs your view of the actual probability.
2. Is the resolution unambiguous? Skip markets where outcome depends on subjective judgement.
3. Is there enough information to research? Skip markets requiring insider knowledge.
4. Is the time-to-resolution reasonable? Short-dated mispricings are higher confidence.

MARKETS:
${numbered}

For each market output:
- score (0-100): overall recommendation — should the user consider this bet? (higher = better)
- confidence (0-100): how confident you are in your assessment
- thesis (one short sentence): why it's a good or bad bet
- suggested_side ("yes" | "no" | null): which side to take if scoring high, null if neutral/skip
- edge_pct (number, can be negative): your estimated fair YES probability MINUS the current market YES price, in percentage points. Positive = YES is underpriced.
- concerns (one short sentence): what could invalidate this thesis

Output STRICT JSON, an array exactly the length of the input:
{
  "scores": [
    { "index": 1, "score": 72, "confidence": 65, "thesis": "...", "suggested_side": "yes", "edge_pct": 8, "concerns": "..." },
    ...
  ]
}

Rules:
- Be conservative: most markets are efficiently priced. Default score should be 30-55.
- Only score above 70 if there is a clear mispricing AND you have a concrete reason.
- Score below 20 = avoid entirely.
- Output JSON only.`

  try {
    const { text } = await generateText({ model: getModel(), prompt, temperature: 0.3 })
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return out
    const parsed = JSON.parse(match[0]) as {
      scores: Array<{ index: number; score: number; confidence: number; thesis: string; suggested_side: string; edge_pct: number; concerns: string }>
    }
    for (const s of parsed.scores ?? []) {
      const market = batch[Math.max(0, (s.index ?? 1) - 1)]
      if (!market) continue
      const side: MarketScore["suggestedSide"] =
        s.suggested_side === "yes" || s.suggested_side === "no" ? s.suggested_side : null
      out.set(market.id, {
        marketId: market.id,
        score: Math.max(0, Math.min(100, Math.round(s.score ?? 0))),
        confidence: Math.max(0, Math.min(100, Math.round(s.confidence ?? 0))),
        thesis: typeof s.thesis === "string" ? s.thesis : "",
        suggestedSide: side,
        edgePct: Number.isFinite(s.edge_pct) ? Number(s.edge_pct) : 0,
        concerns: typeof s.concerns === "string" ? s.concerns : "",
      })
    }
  } catch (err) {
    console.error("Polymarket scoring failed:", err)
  }

  return out
}

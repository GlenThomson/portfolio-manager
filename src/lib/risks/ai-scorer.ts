import { generateText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { NewsHeadline } from "./news-search"

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

export interface ScoredHeadline {
  title: string
  url: string
  source: string
  publishedAt: string
  severity: number          // 0-10: how much this headline elevates the risk
  direction: "escalating" | "stable" | "deescalating" | "unrelated"
  reasoning: string
}

export interface RiskScoreResult {
  score: number             // 0-100 composite
  summary: string           // 1-2 sentence plain-English status
  headlines: ScoredHeadline[]
}

/**
 * Score a batch of headlines against a risk description in a SINGLE AI call.
 * Returns per-headline scores plus a composite.
 */
export async function scoreHeadlinesForRisk(
  riskTitle: string,
  riskDescription: string,
  headlines: NewsHeadline[],
): Promise<RiskScoreResult> {
  if (headlines.length === 0) {
    return {
      score: 0,
      summary: `No recent news found for "${riskTitle}".`,
      headlines: [],
    }
  }

  // Cap at ~30 headlines to keep prompt size manageable
  const batch = headlines.slice(0, 30)

  const numbered = batch.map((h, i) => `${i + 1}. [${h.source}] ${h.title}`).join("\n")

  const prompt = `You are a risk analyst scoring news headlines for how much they change the probability of a specific risk occurring. Output STRICT JSON — no prose, no markdown.

RISK BEING MONITORED
Title: ${riskTitle}
Description: ${riskDescription || "(no description)"}

HEADLINES TO SCORE
${numbered}

For each headline, produce:
- severity (0-10): how much this specific headline INCREASES or reveals the risk. 0 = unrelated or deescalating. 10 = major escalation.
- direction: "escalating" (raises risk), "stable" (confirms status quo), "deescalating" (reduces risk), "unrelated" (not really about this risk).
- reasoning (1 short sentence): why you gave that score.

Then produce:
- composite score (0-100): overall risk level right now, weighing recency and severity. 0 = effectively no risk signal. 30 = background noise. 60 = elevated. 80 = acute. 100 = imminent.
- summary (1-2 sentences): plain-English status of this risk based on the headlines.

Return JSON exactly in this shape:
{
  "score": number,
  "summary": string,
  "headlines": [
    { "index": number, "severity": number, "direction": "escalating"|"stable"|"deescalating"|"unrelated", "reasoning": string }
  ]
}

Only include headlines with severity >= 2 OR direction != "unrelated" in the headlines array. Keep headlines array sorted by severity descending.`

  try {
    const { text } = await generateText({
      model: getModel(),
      prompt,
      temperature: 0.2,
    })

    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim()
    let parsed: {
      score: number
      summary: string
      headlines: Array<{ index: number; severity: number; direction: string; reasoning: string }>
    }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        return {
          score: 0,
          summary: "AI scoring failed (malformed response).",
          headlines: [],
        }
      }
      parsed = JSON.parse(match[0])
    }

    // Map back to full headline objects
    const scored: ScoredHeadline[] = (parsed.headlines ?? []).map((h) => {
      const src = batch[h.index - 1] ?? batch[0]
      const dir = ["escalating", "stable", "deescalating", "unrelated"].includes(h.direction)
        ? (h.direction as ScoredHeadline["direction"])
        : "unrelated"
      return {
        title: src.title,
        url: src.url,
        source: src.source,
        publishedAt: src.publishedAt,
        severity: Math.max(0, Math.min(10, Math.round(h.severity ?? 0))),
        direction: dir,
        reasoning: typeof h.reasoning === "string" ? h.reasoning : "",
      }
    })

    const score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)))
    const summary = typeof parsed.summary === "string" && parsed.summary.length > 0
      ? parsed.summary
      : `Risk level ${score}/100.`

    return { score, summary, headlines: scored }
  } catch (err) {
    console.error("scoreHeadlinesForRisk failed:", err)
    return {
      score: 0,
      summary: "Scoring failed — try again later.",
      headlines: [],
    }
  }
}

/**
 * AI-extract search keywords, tickers, and relevant data providers from a
 * risk title + description.
 */
export async function suggestKeywordsForRisk(
  title: string,
  description: string,
): Promise<{ keywords: string[]; suggestedTickers: string[]; suggestedHedgeTickers: string[]; suggestedProviders: string[] }> {
  const prompt = `You are helping a user set up a risk-monitoring system. Given the risk, produce search queries, relevant tickers, hedge candidates, and which data providers should be enabled.

RISK
Title: ${title}
Description: ${description || "(no description)"}

Output STRICT JSON:
{
  "keywords": [string, ...],              // 3-6 Google News search phrases. Use quoted multi-word phrases.
  "suggested_tickers": [string, ...],     // 0-5 tickers whose price/volatility correlate with this risk (Yahoo Finance symbols incl. indices like ^VIX, ^TWII, forex like TWD=X). These feed market-signal scoring.
  "suggested_hedge_tickers": [string, ...], // 0-5 tickers the user could trade as a HEDGE if the risk materialises. For directional risks this is usually the same as suggested_tickers but emphasises the most liquid / cleanest hedge instruments. The system will score these for entry conditions (RSI, drawdown).
  "suggested_providers": [string, ...]    // subset of: ["news", "market", "polymarket", "taiwan_incursions"]
}

Provider selection rules:
- "news" is always included (baseline).
- "market" if the risk has correlated tickers worth tracking volatility/drawdowns on.
- "polymarket" if the risk is the kind of event people would bet on (geopolitical events, elections, macro outcomes).
- "taiwan_incursions" ONLY if the risk is specifically about Taiwan / China-Taiwan military tensions.

Examples:
- "Taiwan invasion": keywords ["Taiwan invasion","China Taiwan military","PLA Taiwan","Taiwan Strait median line","Xi Jinping Taiwan"], tickers ["TSM","^TWII","TWD=X","ITA"], hedge_tickers ["TSM","NVDA","AVGO","ASML"] (semiconductors that drop on Taiwan disruption — buy puts), providers ["news","market","polymarket","taiwan_incursions"]
- "Banking crisis": keywords ["regional bank failure","bank run","FDIC takeover","deposit flight"], tickers ["KRE","XLF"], hedge_tickers ["KRE","XLF","BAC"], providers ["news","market"]
- "Fed hawkish pivot": keywords ["Fed rate hike","hawkish Fed","inflation surprise"], tickers ["TLT","^VIX","DXY"], hedge_tickers ["TLT","SPY","QQQ"], providers ["news","market","polymarket"]

No markdown, no prose. JSON only.`

  try {
    const { text } = await generateText({
      model: getModel(),
      prompt,
      temperature: 0.3,
    })
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { keywords: [title], suggestedTickers: [], suggestedHedgeTickers: [], suggestedProviders: ["news"] }
    const parsed = JSON.parse(match[0])
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === "string").slice(0, 6) : [title]
    const tickers = Array.isArray(parsed.suggested_tickers) ? parsed.suggested_tickers.filter((k: unknown) => typeof k === "string").slice(0, 5) : []
    const hedges = Array.isArray(parsed.suggested_hedge_tickers) ? parsed.suggested_hedge_tickers.filter((k: unknown) => typeof k === "string").slice(0, 5) : []
    const VALID_PROVIDERS = ["news", "market", "polymarket", "taiwan_incursions"]
    const providersRaw = Array.isArray(parsed.suggested_providers)
      ? parsed.suggested_providers.filter((k: unknown) => typeof k === "string" && VALID_PROVIDERS.includes(k as string))
      : ["news"]
    const providers = providersRaw.includes("news") ? providersRaw : ["news", ...providersRaw]
    return { keywords, suggestedTickers: tickers, suggestedHedgeTickers: hedges, suggestedProviders: providers }
  } catch {
    return { keywords: [title], suggestedTickers: [], suggestedHedgeTickers: [], suggestedProviders: ["news"] }
  }
}

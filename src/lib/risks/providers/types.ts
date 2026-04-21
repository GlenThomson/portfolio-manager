/**
 * Provider framework for risk monitoring.
 * Each provider consumes the monitor's config and returns a 0-100 signal
 * plus opaque "data" (rendered by the UI). Final composite score is the
 * weight-normalised sum of enabled providers' scores.
 */

export type ProviderKey = "news" | "market" | "polymarket" | "taiwan_incursions"

export interface MonitorContext {
  id: string
  userId: string
  title: string
  description: string | null
  keywords: string[]
  linkedTickers: string[]
}

export interface ProviderResult {
  key: ProviderKey
  score: number          // 0-100 (this provider's severity reading)
  weight: number         // relative weight in composite (default weights below)
  summary: string        // 1-sentence human-readable status
  data: Record<string, unknown> // arbitrary provider-specific payload (headlines, tickers, contracts, etc.) — UI decides how to render
  error?: string         // if provider failed; score treated as 0 and weight 0
}

// Default weights. Composite = Σ(score * weight) / Σ(weight) across enabled + non-errored providers.
export const DEFAULT_WEIGHTS: Record<ProviderKey, number> = {
  news: 0.40,
  market: 0.20,
  polymarket: 0.15,
  taiwan_incursions: 0.25,
}

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  news: "News sentiment",
  market: "Market signals",
  polymarket: "Prediction markets",
  taiwan_incursions: "PLA ADIZ incursions",
}

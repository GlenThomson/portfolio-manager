/**
 * Sentiment score (0-100) combining news headlines, Reddit sentiment (contrarian),
 * analyst consensus + dispersion, insider activity, and Fear & Greed macro overlay.
 *
 * Research adjustments:
 *   - Reddit/WSB: contrarian warning at extremes (high attention = -8.5% returns)
 *   - Analyst dispersion: low = positive, high = warning (Yale research)
 *   - Analyst targets: discounted ~15% for systematic upward bias
 *   - Insider C-suite cluster buys weighted higher (>50bps/month abnormal returns)
 */

export interface SentimentInput {
  // News sentiment: count of positive/negative/neutral headlines
  newsPositive: number
  newsNegative: number
  newsNeutral: number
  // Reddit (from reddit.ts)
  wsbSentiment: string | null // "Bullish" | "Bearish"
  wsbSentimentScore: number | null // 0-1
  redditMentions: number | null
  // Fear & Greed (0-100, from fear-greed.ts)
  fearGreedScore: number | null
  // Analyst recommendation
  recommendationKey: string | null
  // Analyst dispersion (standard deviation of recommendation distribution)
  analystDispersion: number | null
  // Analyst price target
  targetMeanPrice: number | null
  currentPrice: number | null
  // Insider activity (from Finnhub)
  insiderNetBuys: number | null // net purchases in last 90 days
  insiderCsuitebuys: number | null // C-suite buys specifically
}

export interface SentimentScoreResult {
  score: number
  details: Record<string, string>
}

/**
 * Simple keyword-based headline sentiment classifier.
 * Returns "positive", "negative", or "neutral".
 */
export function classifyHeadline(headline: string): "positive" | "negative" | "neutral" {
  const lower = headline.toLowerCase()

  const positiveWords = [
    "surge", "surges", "soar", "soars", "rally", "rallies", "gain", "gains",
    "rise", "rises", "jump", "jumps", "upgrade", "upgraded", "beat", "beats",
    "outperform", "bullish", "record high", "breakout", "strong", "growth",
    "profit", "revenue beat", "buy rating", "raises guidance", "raises target",
    "positive", "optimism", "boom", "recovery", "momentum",
  ]

  const negativeWords = [
    "crash", "crashes", "plunge", "plunges", "drop", "drops", "fall", "falls",
    "decline", "declines", "downgrade", "downgraded", "miss", "misses",
    "underperform", "bearish", "record low", "breakdown", "weak", "loss",
    "layoff", "layoffs", "cuts", "sell rating", "lowers guidance", "lowers target",
    "negative", "fear", "recession", "warning", "lawsuit", "investigation",
    "fraud", "debt", "default", "bankruptcy",
  ]

  let posCount = 0
  let negCount = 0

  for (const word of positiveWords) {
    if (lower.includes(word)) posCount++
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negCount++
  }

  if (posCount > negCount) return "positive"
  if (negCount > posCount) return "negative"
  return "neutral"
}

export function computeSentimentScore(input: SentimentInput): SentimentScoreResult {
  let score = 50
  const details: Record<string, string> = {}

  // News sentiment contribution (up to +/- 20)
  const totalNews = input.newsPositive + input.newsNegative + input.newsNeutral
  if (totalNews > 0) {
    const netSentiment = (input.newsPositive - input.newsNegative) / totalNews
    const newsPoints = Math.round(netSentiment * 20)
    score += newsPoints

    if (netSentiment > 0.3) {
      details.news = `News sentiment positive (${input.newsPositive}/${totalNews} positive headlines)`
    } else if (netSentiment < -0.3) {
      details.news = `News sentiment negative (${input.newsNegative}/${totalNews} negative headlines)`
    } else {
      details.news = `News sentiment mixed (${input.newsPositive} pos, ${input.newsNegative} neg, ${input.newsNeutral} neutral)`
    }
  } else {
    details.news = "No recent news headlines found"
  }

  // Reddit sentiment — CONTRARIAN at extremes (research: WSB attention = -8.5% returns)
  if (input.wsbSentimentScore != null) {
    const mentions = input.redditMentions ?? 0
    const sentiment = input.wsbSentiment ?? (input.wsbSentimentScore > 0.5 ? "Bullish" : "Bearish")
    const pct = Math.round(input.wsbSentimentScore * 100)

    if (mentions > 50 && input.wsbSentimentScore > 0.7) {
      // High attention + very bullish = contrarian warning
      score -= 8
      details.reddit = `Reddit/WSB: ${sentiment} (${pct}%), ${mentions} mentions — contrarian warning (high hype)`
    } else if (mentions > 50 && input.wsbSentimentScore < 0.3) {
      // High attention + very bearish = potential contrarian buy
      score += 5
      details.reddit = `Reddit/WSB: ${sentiment} (${pct}%), ${mentions} mentions — contrarian bullish (extreme fear)`
    } else {
      // Normal levels — mild influence
      const redditPoints = Math.round((input.wsbSentimentScore - 0.5) * 10)
      score += redditPoints
      details.reddit = `Reddit/WSB: ${sentiment} (${pct}%)`
      if (mentions > 0) details.reddit += `, ${mentions} mentions`
    }
  } else {
    details.reddit = "No Reddit sentiment data available"
  }

  // Analyst consensus + dispersion
  if (input.recommendationKey) {
    const key = input.recommendationKey.toLowerCase()
    if (key === "strong_buy" || key === "strongbuy") {
      score += 8
      details.analysts = "Analyst consensus: Strong Buy"
    } else if (key === "buy") {
      score += 5
      details.analysts = "Analyst consensus: Buy"
    } else if (key === "hold") {
      details.analysts = "Analyst consensus: Hold (neutral)"
    } else if (key === "sell" || key === "underperform") {
      score -= 5
      details.analysts = `Analyst consensus: ${input.recommendationKey}`
    } else if (key === "strong_sell" || key === "strongsell") {
      score -= 8
      details.analysts = "Analyst consensus: Strong Sell"
    } else {
      details.analysts = `Analyst consensus: ${input.recommendationKey}`
    }
  } else {
    details.analysts = "Analyst recommendation unavailable"
  }

  // Analyst dispersion (research: low dispersion = positive signal)
  if (input.analystDispersion != null) {
    if (input.analystDispersion < 0.8) {
      score += 5
      details.dispersion = `Analyst dispersion low (${input.analystDispersion.toFixed(2)}) — strong consensus agreement`
    } else if (input.analystDispersion < 1.5) {
      details.dispersion = `Analyst dispersion moderate (${input.analystDispersion.toFixed(2)})`
    } else {
      score -= 5
      details.dispersion = `Analyst dispersion high (${input.analystDispersion.toFixed(2)}) — significant disagreement`
    }
  }

  // Analyst price target (discounted 15% for upward bias)
  if (input.targetMeanPrice != null && input.currentPrice != null && input.currentPrice > 0) {
    const adjustedTarget = input.targetMeanPrice * 0.85
    const upside = ((adjustedTarget - input.currentPrice) / input.currentPrice) * 100

    if (upside > 20) {
      score += 5
      details.priceTarget = `Adjusted target $${adjustedTarget.toFixed(0)} (+${upside.toFixed(0)}% upside, raw target discounted 15%)`
    } else if (upside > 5) {
      score += 2
      details.priceTarget = `Adjusted target $${adjustedTarget.toFixed(0)} (+${upside.toFixed(0)}% upside after 15% discount)`
    } else if (upside < -10) {
      score -= 5
      details.priceTarget = `Adjusted target $${adjustedTarget.toFixed(0)} (${upside.toFixed(0)}% downside even after 15% bias discount)`
    } else {
      details.priceTarget = `Adjusted target $${adjustedTarget.toFixed(0)} (near current price after 15% bias discount)`
    }
  }

  // Insider activity (research: C-suite cluster buys = strongest signal)
  if (input.insiderNetBuys != null) {
    const cSuiteBuys = input.insiderCsuitebuys ?? 0

    if (cSuiteBuys >= 2) {
      // C-suite cluster buying — strongest insider signal
      score += 8
      details.insider = `${cSuiteBuys} C-suite insider purchases in 90 days — strong bullish signal`
    } else if (input.insiderNetBuys > 3) {
      score += 5
      details.insider = `Net ${input.insiderNetBuys} insider purchases in 90 days — bullish activity`
    } else if (input.insiderNetBuys > 0) {
      score += 2
      details.insider = `Net ${input.insiderNetBuys} insider purchase(s) in 90 days`
    } else if (input.insiderNetBuys < -3) {
      score -= 5
      details.insider = `Net ${Math.abs(input.insiderNetBuys)} insider sales in 90 days — bearish activity`
    } else if (input.insiderNetBuys < 0) {
      score -= 2
      details.insider = `Net ${Math.abs(input.insiderNetBuys)} insider sale(s) in 90 days`
    } else {
      details.insider = "No significant insider activity in 90 days"
    }
  }

  // Fear & Greed macro overlay (+/- 8)
  if (input.fearGreedScore != null && !isNaN(input.fearGreedScore)) {
    if (input.fearGreedScore <= 20) {
      score += 8
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Extreme Fear) — contrarian bullish`
    } else if (input.fearGreedScore <= 35) {
      score += 4
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Fear) — mildly contrarian bullish`
    } else if (input.fearGreedScore >= 80) {
      score -= 8
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Extreme Greed) — contrarian bearish`
    } else if (input.fearGreedScore >= 65) {
      score -= 4
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Greed) — mildly contrarian bearish`
    } else {
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} — neutral macro sentiment`
    }
  } else {
    details.fearGreed = "Fear & Greed data unavailable"
  }

  score = Math.max(0, Math.min(100, score))

  return { score, details }
}

/**
 * Sentiment score (0-100) combining news headlines, Reddit sentiment,
 * analyst recommendations, and Fear & Greed macro overlay.
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

  // Reddit sentiment contribution (up to +/- 15)
  if (input.wsbSentimentScore != null) {
    // wsbSentimentScore is 0-1, map to -15 to +15
    const redditPoints = Math.round((input.wsbSentimentScore - 0.5) * 30)
    score += redditPoints

    const sentiment = input.wsbSentiment ?? (input.wsbSentimentScore > 0.5 ? "Bullish" : "Bearish")
    const pct = Math.round(input.wsbSentimentScore * 100)
    details.reddit = `Reddit/WSB: ${sentiment} (${pct}% score)`

    if (input.redditMentions != null && input.redditMentions > 0) {
      details.reddit += `, ${input.redditMentions} mentions`
    }
  } else {
    details.reddit = "No Reddit sentiment data available"
  }

  // Analyst recommendation contribution (up to +/- 10)
  if (input.recommendationKey) {
    const key = input.recommendationKey.toLowerCase()
    if (key === "strong_buy" || key === "strongbuy") {
      score += 10
      details.analysts = "Analyst consensus: Strong Buy (+10)"
    } else if (key === "buy") {
      score += 6
      details.analysts = "Analyst consensus: Buy (+6)"
    } else if (key === "hold") {
      details.analysts = "Analyst consensus: Hold (neutral)"
    } else if (key === "sell" || key === "underperform") {
      score -= 6
      details.analysts = `Analyst consensus: ${input.recommendationKey} (-6)`
    } else if (key === "strong_sell" || key === "strongsell") {
      score -= 10
      details.analysts = "Analyst consensus: Strong Sell (-10)"
    } else {
      details.analysts = `Analyst consensus: ${input.recommendationKey}`
    }
  } else {
    details.analysts = "Analyst recommendation unavailable"
  }

  // Fear & Greed macro overlay (+/- 10)
  if (input.fearGreedScore != null && !isNaN(input.fearGreedScore)) {
    if (input.fearGreedScore <= 20) {
      // Extreme fear = contrarian bullish
      score += 10
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Extreme Fear) — contrarian bullish`
    } else if (input.fearGreedScore <= 35) {
      score += 5
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Fear) — mildly contrarian bullish`
    } else if (input.fearGreedScore >= 80) {
      // Extreme greed = contrarian bearish
      score -= 10
      details.fearGreed = `Fear & Greed ${input.fearGreedScore} (Extreme Greed) — contrarian bearish`
    } else if (input.fearGreedScore >= 65) {
      score -= 5
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

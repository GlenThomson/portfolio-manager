/**
 * Technical score (0-100) based on RSI, MACD, Bollinger Bands, SMA, and volume.
 */

export interface TechnicalInput {
  rsi: number | null
  macdHistogram: number | null
  macdHistogramPrev: number | null
  bollingerPercentB: number | null
  price: number
  sma50: number | null
  sma200: number | null
  volumeRatio: number | null // current volume / 20-day average
}

export interface TechnicalScoreResult {
  score: number
  details: Record<string, string>
}

export function computeTechnicalScore(input: TechnicalInput): TechnicalScoreResult {
  // Start at 50 (neutral) and adjust
  let score = 50
  const details: Record<string, string> = {}

  // RSI contribution: +/- 15
  if (input.rsi != null && !isNaN(input.rsi)) {
    if (input.rsi < 30) {
      score += 15
      details.rsi = `RSI ${input.rsi.toFixed(1)} — oversold, bullish signal`
    } else if (input.rsi < 40) {
      score += 8
      details.rsi = `RSI ${input.rsi.toFixed(1)} — approaching oversold`
    } else if (input.rsi > 70) {
      score -= 15
      details.rsi = `RSI ${input.rsi.toFixed(1)} — overbought, bearish signal`
    } else if (input.rsi > 60) {
      score -= 5
      details.rsi = `RSI ${input.rsi.toFixed(1)} — approaching overbought`
    } else {
      details.rsi = `RSI ${input.rsi.toFixed(1)} — neutral`
    }
  } else {
    details.rsi = "RSI data unavailable"
  }

  // Price vs SMA200: +10
  if (input.sma200 != null && !isNaN(input.sma200)) {
    if (input.price > input.sma200) {
      score += 10
      details.sma200 = `Price above 200 SMA ($${input.sma200.toFixed(2)}) — long-term uptrend`
    } else {
      score -= 10
      details.sma200 = `Price below 200 SMA ($${input.sma200.toFixed(2)}) — long-term downtrend`
    }
  } else {
    details.sma200 = "200 SMA data unavailable"
  }

  // Price vs SMA50: +5
  if (input.sma50 != null && !isNaN(input.sma50)) {
    if (input.price > input.sma50) {
      score += 5
      details.sma50 = `Price above 50 SMA — short-term uptrend`
    } else {
      score -= 5
      details.sma50 = `Price below 50 SMA — short-term downtrend`
    }
  } else {
    details.sma50 = "50 SMA data unavailable"
  }

  // Golden/Death cross: SMA50 vs SMA200 — +/- 5
  if (
    input.sma50 != null && !isNaN(input.sma50) &&
    input.sma200 != null && !isNaN(input.sma200)
  ) {
    if (input.sma50 > input.sma200) {
      score += 5
      details.smaCross = "Golden cross (50 SMA > 200 SMA) — bullish"
    } else {
      score -= 5
      details.smaCross = "Death cross (50 SMA < 200 SMA) — bearish"
    }
  }

  // MACD histogram: +/- 8
  if (input.macdHistogram != null && !isNaN(input.macdHistogram)) {
    const rising =
      input.macdHistogramPrev != null &&
      !isNaN(input.macdHistogramPrev) &&
      input.macdHistogram > input.macdHistogramPrev

    if (input.macdHistogram > 0 && rising) {
      score += 8
      details.macd = "MACD histogram positive and rising — strong bullish momentum"
    } else if (input.macdHistogram > 0) {
      score += 4
      details.macd = "MACD histogram positive — bullish momentum"
    } else if (input.macdHistogram < 0 && !rising) {
      score -= 8
      details.macd = "MACD histogram negative and falling — strong bearish momentum"
    } else {
      score -= 4
      details.macd = "MACD histogram negative — bearish momentum"
    }
  } else {
    details.macd = "MACD data unavailable"
  }

  // Bollinger %B: +/- 10
  if (input.bollingerPercentB != null && !isNaN(input.bollingerPercentB)) {
    if (input.bollingerPercentB < 0.1) {
      score += 10
      details.bollinger = `Bollinger %B ${input.bollingerPercentB.toFixed(2)} — near lower band, potential bounce`
    } else if (input.bollingerPercentB < 0.3) {
      score += 5
      details.bollinger = `Bollinger %B ${input.bollingerPercentB.toFixed(2)} — lower range`
    } else if (input.bollingerPercentB > 0.9) {
      score -= 10
      details.bollinger = `Bollinger %B ${input.bollingerPercentB.toFixed(2)} — near upper band, potential pullback`
    } else if (input.bollingerPercentB > 0.7) {
      score -= 5
      details.bollinger = `Bollinger %B ${input.bollingerPercentB.toFixed(2)} — upper range`
    } else {
      details.bollinger = `Bollinger %B ${input.bollingerPercentB.toFixed(2)} — within normal range`
    }
  } else {
    details.bollinger = "Bollinger Bands data unavailable"
  }

  // Volume confirmation: +/- 5
  if (input.volumeRatio != null && !isNaN(input.volumeRatio)) {
    if (input.volumeRatio > 1.5) {
      // High volume confirms current trend direction
      const trendUp = score > 50
      if (trendUp) {
        score += 5
        details.volume = `Volume ${input.volumeRatio.toFixed(1)}x average — confirms bullish move`
      } else {
        score -= 5
        details.volume = `Volume ${input.volumeRatio.toFixed(1)}x average — confirms bearish move`
      }
    } else if (input.volumeRatio < 0.5) {
      details.volume = `Volume ${input.volumeRatio.toFixed(1)}x average — low conviction`
    } else {
      details.volume = `Volume ${input.volumeRatio.toFixed(1)}x average — normal`
    }
  } else {
    details.volume = "Volume data unavailable"
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score))

  return { score, details }
}

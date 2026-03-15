/**
 * Pure functions to compute technical indicators from OHLCV data.
 * No external dependencies required.
 */

/** Compute Simple Moving Average */
export function computeSMA(closes: number[], period: number): number[] {
  const result: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(NaN)
    } else {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j]
      }
      result.push(sum / period)
    }
  }
  return result
}

/** Compute Exponential Moving Average */
export function computeEMA(closes: number[], period: number): number[] {
  const result: number[] = []
  const multiplier = 2 / (period + 1)

  // Use SMA for the first value
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      sum += closes[i]
      result.push(NaN)
    } else if (i === period - 1) {
      sum += closes[i]
      result.push(sum / period)
    } else {
      const prev = result[i - 1]
      result.push((closes[i] - prev) * multiplier + prev)
    }
  }
  return result
}

/** Compute RSI (Relative Strength Index) */
export function computeRSI(closes: number[], period: number = 14): number[] {
  const result: number[] = []
  if (closes.length < period + 1) return closes.map(() => NaN)

  // Calculate price changes
  const changes: number[] = []
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1])
  }

  // First RSI: average gain/loss over initial period
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period

  // First element has no change, and next (period-1) elements don't have enough data
  result.push(NaN) // index 0 (no change available)
  for (let i = 1; i < period; i++) {
    result.push(NaN)
  }

  // First RSI value at index = period
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRS))

  // Subsequent RSI values using smoothed averages
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs))
  }

  return result
}

/** Compute MACD (12, 26, 9) */
export function computeMACD(
  closes: number[]
): { macd: number[]; signal: number[]; histogram: number[] } {
  const ema12 = computeEMA(closes, 12)
  const ema26 = computeEMA(closes, 26)

  // MACD line = EMA12 - EMA26
  const macdLine: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(ema12[i]) || isNaN(ema26[i])) {
      macdLine.push(NaN)
    } else {
      macdLine.push(ema12[i] - ema26[i])
    }
  }

  // Signal line = 9-period EMA of MACD line
  // We need to compute EMA only on the valid (non-NaN) portion
  const validStart = macdLine.findIndex((v) => !isNaN(v))
  const validMacd = validStart >= 0 ? macdLine.slice(validStart) : []
  const signalValues = validMacd.length >= 9 ? computeEMA(validMacd, 9) : validMacd.map(() => NaN)

  const signal: number[] = new Array(validStart >= 0 ? validStart : closes.length).fill(NaN)
  signal.push(...signalValues)

  // Histogram = MACD - Signal
  const histogram: number[] = []
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(signal[i])) {
      histogram.push(NaN)
    } else {
      histogram.push(macdLine[i] - signal[i])
    }
  }

  return { macd: macdLine, signal, histogram }
}

/** Compute Bollinger Bands */
export function computeBollingerBands(
  closes: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = computeSMA(closes, period)
  const upper: number[] = []
  const lower: number[] = []

  for (let i = 0; i < closes.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN)
      lower.push(NaN)
    } else {
      // Calculate standard deviation over the period
      let sumSq = 0
      for (let j = i - period + 1; j <= i; j++) {
        const diff = closes[j] - middle[i]
        sumSq += diff * diff
      }
      const sd = Math.sqrt(sumSq / period)
      upper.push(middle[i] + stdDev * sd)
      lower.push(middle[i] - stdDev * sd)
    }
  }

  return { upper, middle, lower }
}

/** Compute ATR (Average True Range) */
export function computeATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number[] {
  const result: number[] = [NaN] // First element has no previous close

  // True Range values
  const trValues: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    trValues.push(tr)
  }

  // First ATR = average of first `period` TR values
  if (trValues.length < period) return closes.map(() => NaN)

  let atr = 0
  for (let i = 0; i < period; i++) {
    atr += trValues[i]
    result.push(NaN)
  }
  atr /= period
  // Replace the last NaN with the first ATR value
  result[result.length - 1] = atr

  // Subsequent ATR values using smoothing
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period
    result.push(atr)
  }

  return result
}

/** Compute VWAP (Volume Weighted Average Price) — cumulative from start of data */
export function computeVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): number[] {
  const result: number[] = []
  let cumulativeTPV = 0
  let cumulativeVolume = 0

  for (let i = 0; i < closes.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3
    cumulativeTPV += typicalPrice * volumes[i]
    cumulativeVolume += volumes[i]
    result.push(cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : NaN)
  }

  return result
}

import type { OHLC, IndicatorData } from "@/types/market"

export function calcSMA(data: OHLC[], period: number): IndicatorData[] {
  const result: IndicatorData[] = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close
    }
    result.push({ time: data[i].time, value: sum / period })
  }
  return result
}

export function calcEMA(data: OHLC[], period: number): IndicatorData[] {
  const result: IndicatorData[] = []
  const multiplier = 2 / (period + 1)

  // Start with SMA for the first value
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += data[i].close
  }
  let ema = sum / period
  result.push({ time: data[period - 1].time, value: ema })

  for (let i = period; i < data.length; i++) {
    ema = (data[i].close - ema) * multiplier + ema
    result.push({ time: data[i].time, value: ema })
  }
  return result
}

export function calcRSI(data: OHLC[], period: number = 14): IndicatorData[] {
  const result: IndicatorData[] = []
  const changes: number[] = []

  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i - 1].close)
  }

  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
  result.push({ time: data[period].time, value: 100 - 100 / (1 + rs) })

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const newRs = avgLoss === 0 ? 100 : avgGain / avgLoss
    result.push({ time: data[i + 1].time, value: 100 - 100 / (1 + newRs) })
  }

  return result
}

export function calcMACD(data: OHLC[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const emaFast = calcEMA(data, fast)
  const emaSlow = calcEMA(data, slow)

  // Align the two EMAs by time
  const slowTimes = new Set(emaSlow.map((d) => d.time))
  const alignedFast = emaFast.filter((d) => slowTimes.has(d.time))
  const slowMap = new Map(emaSlow.map((d) => [d.time, d.value]))

  const macdLine: IndicatorData[] = alignedFast.map((d) => ({
    time: d.time,
    value: d.value - (slowMap.get(d.time) ?? 0),
  }))

  // Signal line (EMA of MACD)
  const signalLine: IndicatorData[] = []
  if (macdLine.length >= signal) {
    const multiplier = 2 / (signal + 1)
    let sum = 0
    for (let i = 0; i < signal; i++) sum += macdLine[i].value
    let ema = sum / signal
    signalLine.push({ time: macdLine[signal - 1].time, value: ema })
    for (let i = signal; i < macdLine.length; i++) {
      ema = (macdLine[i].value - ema) * multiplier + ema
      signalLine.push({ time: macdLine[i].time, value: ema })
    }
  }

  // Histogram
  const signalMap = new Map(signalLine.map((d) => [d.time, d.value]))
  const histogram: IndicatorData[] = macdLine
    .filter((d) => signalMap.has(d.time))
    .map((d) => ({
      time: d.time,
      value: d.value - (signalMap.get(d.time) ?? 0),
    }))

  return { macdLine, signalLine, histogram }
}

export function calcBollingerBands(data: OHLC[], period: number = 20, stdDev: number = 2) {
  const sma = calcSMA(data, period)
  const upper: IndicatorData[] = []
  const lower: IndicatorData[] = []

  for (let i = 0; i < sma.length; i++) {
    const dataIdx = i + period - 1
    let sumSqDiff = 0
    for (let j = 0; j < period; j++) {
      const diff = data[dataIdx - j].close - sma[i].value
      sumSqDiff += diff * diff
    }
    const sd = Math.sqrt(sumSqDiff / period)
    upper.push({ time: sma[i].time, value: sma[i].value + stdDev * sd })
    lower.push({ time: sma[i].time, value: sma[i].value - stdDev * sd })
  }

  return { middle: sma, upper, lower }
}

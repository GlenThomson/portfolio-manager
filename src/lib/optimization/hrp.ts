/**
 * Hierarchical Risk Parity (HRP) allocation.
 * Based on López de Prado (2016) — builds a hierarchical tree from the
 * correlation matrix, then allocates inversely proportional to cluster variance.
 *
 * Only needs a return series for each asset — no expected-return estimates,
 * which avoids the biggest source of error in mean-variance optimization.
 */

import { getChart } from "@/lib/market/yahoo"

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────

export interface HRPAllocation {
  symbol: string
  weight: number // 0-1
  currentWeight: number // current portfolio weight
  suggestedAction: "increase" | "decrease" | "hold"
  delta: number // weight difference (suggested - current)
}

export interface HRPResult {
  allocations: HRPAllocation[]
  correlationInsights: string[]
  methodology: string
}

// ──────────────────────────────────────────────────────
// Math helpers
// ──────────────────────────────────────────────────────

/** Compute daily log returns from prices. */
function logReturns(prices: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      r.push(Math.log(prices[i] / prices[i - 1]))
    }
  }
  return r
}

/** Pearson correlation between two arrays of equal length. */
function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 10) return 0

  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]
    sumB += b[i]
    sumAB += a[i] * b[i]
    sumA2 += a[i] * a[i]
    sumB2 += b[i] * b[i]
  }

  const num = n * sumAB - sumA * sumB
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))
  if (den === 0) return 0
  return Math.max(-1, Math.min(1, num / den))
}

/** Standard deviation of an array. */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

/** Convert correlation matrix to distance matrix: d = sqrt(0.5 * (1 - corr)). */
function corrToDistance(corrMatrix: number[][]): number[][] {
  return corrMatrix.map(row =>
    row.map(c => Math.sqrt(0.5 * (1 - c)))
  )
}

// ──────────────────────────────────────────────────────
// Single-linkage clustering (simplified Ward-like)
// ──────────────────────────────────────────────────────

interface ClusterNode {
  id: number
  left?: ClusterNode
  right?: ClusterNode
  items: number[] // leaf indices
}

function singleLinkageClustering(distMatrix: number[][]): ClusterNode {
  const n = distMatrix.length

  // Start with each item as its own cluster
  let clusters: ClusterNode[] = Array.from({ length: n }, (_, i) => ({
    id: i,
    items: [i],
  }))

  // Copy distance matrix (we'll modify it)
  const dist = distMatrix.map(row => [...row])

  let nextId = n

  while (clusters.length > 1) {
    // Find closest pair
    let minDist = Infinity
    let minI = 0
    let minJ = 1

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Average linkage between clusters
        let totalDist = 0
        let count = 0
        for (const a of clusters[i].items) {
          for (const b of clusters[j].items) {
            totalDist += dist[a][b]
            count++
          }
        }
        const avgDist = count > 0 ? totalDist / count : Infinity
        if (avgDist < minDist) {
          minDist = avgDist
          minI = i
          minJ = j
        }
      }
    }

    // Merge clusters[minI] and clusters[minJ]
    const merged: ClusterNode = {
      id: nextId++,
      left: clusters[minI],
      right: clusters[minJ],
      items: [...clusters[minI].items, ...clusters[minJ].items],
    }

    // Remove old clusters, add merged
    clusters = clusters.filter((_, idx) => idx !== minI && idx !== minJ)
    clusters.push(merged)
  }

  return clusters[0]
}

/** Get the quasi-diagonal ordering from the dendrogram (leaf traversal). */
function getQuasiDiagOrder(node: ClusterNode): number[] {
  if (!node.left && !node.right) return [node.id]
  const left = node.left ? getQuasiDiagOrder(node.left) : []
  const right = node.right ? getQuasiDiagOrder(node.right) : []
  return [...left, ...right]
}

// ──────────────────────────────────────────────────────
// Recursive bisection (HRP weight allocation)
// ──────────────────────────────────────────────────────

function getClusterVariance(
  returns: number[][],
  indices: number[]
): number {
  if (indices.length === 0) return 0
  if (indices.length === 1) {
    const sd = stdDev(returns[indices[0]])
    return sd * sd
  }

  // Portfolio variance with inverse-variance weights within the cluster
  const variances = indices.map(i => {
    const sd = stdDev(returns[i])
    return sd * sd || 0.0001 // avoid zero
  })

  const invVars = variances.map(v => 1 / v)
  const totalInvVar = invVars.reduce((s, v) => s + v, 0)
  const weights = invVars.map(iv => iv / totalInvVar)

  // Weighted variance (simplified — ignores covariance for speed)
  return weights.reduce((s, w, i) => s + w * w * variances[i], 0)
}

function recursiveBisection(
  returns: number[][],
  order: number[],
  weights: number[]
): void {
  if (order.length <= 1) return

  const mid = Math.floor(order.length / 2)
  const left = order.slice(0, mid)
  const right = order.slice(mid)

  const varLeft = getClusterVariance(returns, left)
  const varRight = getClusterVariance(returns, right)
  const totalVar = varLeft + varRight

  // Allocate inversely proportional to variance
  const alphaLeft = totalVar > 0 ? 1 - varLeft / totalVar : 0.5
  const alphaRight = 1 - alphaLeft

  for (const i of left) weights[i] *= alphaLeft
  for (const i of right) weights[i] *= alphaRight

  recursiveBisection(returns, left, weights)
  recursiveBisection(returns, right, weights)
}

// ──────────────────────────────────────────────────────
// Main HRP function
// ──────────────────────────────────────────────────────

/**
 * Compute HRP allocation for a set of symbols.
 * @param symbols - Ticker symbols in the portfolio
 * @param currentWeights - Current portfolio weights (0-1), same order as symbols
 */
export async function computeHRPAllocation(
  symbols: string[],
  currentWeights: number[]
): Promise<HRPResult> {
  if (symbols.length < 2) {
    return {
      allocations: symbols.map((s, i) => ({
        symbol: s,
        weight: 1,
        currentWeight: currentWeights[i] ?? 1,
        suggestedAction: "hold" as const,
        delta: 0,
      })),
      correlationInsights: ["Need at least 2 positions for HRP analysis"],
      methodology: "Hierarchical Risk Parity (López de Prado, 2016)",
    }
  }

  // Fetch 1 year of daily prices for all symbols
  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setDate(oneYearAgo.getDate() - 365)
  const period1 = oneYearAgo.toISOString().split("T")[0]

  const priceData = await Promise.allSettled(
    symbols.map(s => getChart(s, period1, "1d"))
  )

  // Extract closing prices, align dates
  const closesMap = new Map<string, Map<string, number>>()
  const allDates = new Set<string>()

  symbols.forEach((sym, i) => {
    const result = priceData[i]
    if (result.status !== "fulfilled" || !result.value) return
    const dateMap = new Map<string, number>()
    for (const candle of result.value) {
      if (candle.date && candle.close > 0) {
        const dateStr = typeof candle.date === "string"
          ? candle.date.split("T")[0]
          : new Date(candle.date).toISOString().split("T")[0]
        dateMap.set(dateStr, candle.close)
        allDates.add(dateStr)
      }
    }
    closesMap.set(sym, dateMap)
  })

  // Find common dates (all symbols have data)
  const sortedDates = Array.from(allDates).sort()
  const commonDates = sortedDates.filter(d =>
    symbols.every(s => closesMap.get(s)?.has(d))
  )

  if (commonDates.length < 30) {
    // Not enough common data — fall back to equal weight
    const eqWeight = 1 / symbols.length
    return {
      allocations: symbols.map((s, i) => ({
        symbol: s,
        weight: eqWeight,
        currentWeight: currentWeights[i] ?? 0,
        suggestedAction: "hold" as const,
        delta: eqWeight - (currentWeights[i] ?? 0),
      })),
      correlationInsights: [
        `Insufficient overlapping price data (${commonDates.length} days). Falling back to equal weight.`,
      ],
      methodology: "Equal weight fallback (insufficient data for HRP)",
    }
  }

  // Build aligned price arrays and compute returns
  const alignedPrices: number[][] = symbols.map(s => {
    const dateMap = closesMap.get(s)!
    return commonDates.map(d => dateMap.get(d)!)
  })

  const returns = alignedPrices.map(prices => logReturns(prices))

  // Correlation matrix
  const n = symbols.length
  const corrMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    corrMatrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const corr = pearsonCorrelation(returns[i], returns[j])
      corrMatrix[i][j] = corr
      corrMatrix[j][i] = corr
    }
  }

  // Distance matrix and clustering
  const distMatrix = corrToDistance(corrMatrix)
  const root = singleLinkageClustering(distMatrix)
  const order = getQuasiDiagOrder(root)

  // Recursive bisection
  const weights = Array(n).fill(1)
  recursiveBisection(returns, order, weights)

  // Normalize weights
  const totalWeight = weights.reduce((s: number, w: number) => s + w, 0)
  const normalizedWeights = weights.map((w: number) => w / totalWeight)

  // Generate correlation insights
  const insights: string[] = []

  // Find highest and lowest correlations
  let maxCorr = -2, minCorr = 2
  let maxPair = [0, 1], minPair = [0, 1]
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (corrMatrix[i][j] > maxCorr) {
        maxCorr = corrMatrix[i][j]
        maxPair = [i, j]
      }
      if (corrMatrix[i][j] < minCorr) {
        minCorr = corrMatrix[i][j]
        minPair = [i, j]
      }
    }
  }

  if (n >= 2) {
    insights.push(
      `Highest correlation: ${symbols[maxPair[0]]} & ${symbols[maxPair[1]]} (${maxCorr.toFixed(2)}) — these move together`
    )
    insights.push(
      `Lowest correlation: ${symbols[minPair[0]]} & ${symbols[minPair[1]]} (${minCorr.toFixed(2)}) — good diversification pair`
    )
  }

  if (maxCorr > 0.8) {
    insights.push(
      `Warning: ${symbols[maxPair[0]]} and ${symbols[maxPair[1]]} are highly correlated (${maxCorr.toFixed(2)}). Consider if both are needed.`
    )
  }

  // Build allocations
  const allocations: HRPAllocation[] = symbols.map((sym, i) => {
    const suggested = Math.round(normalizedWeights[i] * 10000) / 10000
    const current = currentWeights[i] ?? 0
    const delta = Math.round((suggested - current) * 10000) / 10000
    const threshold = 0.03 // 3% tolerance
    const action: HRPAllocation["suggestedAction"] =
      delta > threshold ? "increase" : delta < -threshold ? "decrease" : "hold"

    return {
      symbol: sym,
      weight: suggested,
      currentWeight: Math.round(current * 10000) / 10000,
      suggestedAction: action,
      delta,
    }
  })

  allocations.sort((a, b) => b.weight - a.weight)

  return {
    allocations,
    correlationInsights: insights,
    methodology: `Hierarchical Risk Parity (López de Prado, 2016) — ${commonDates.length} trading days of data`,
  }
}

/**
 * Momentum score (0-100) combining price momentum (3m/6m/12m returns)
 * with EPS revision signals (breadth + magnitude).
 *
 * Research basis: EPS revisions are the most durable short-term alpha signal
 * (Mill Street, FactSet). Combining with price momentum gives highest conviction.
 *
 * Sub-score weights:
 *   Price momentum: 40%
 *   EPS revision breadth: 30%
 *   EPS revision magnitude: 30%
 */

export interface MomentumInput {
  currentPrice: number
  price3mAgo: number | null
  price6mAgo: number | null
  price12mAgo: number | null
  // EPS revision data from Yahoo earningsTrend
  epsRevisionsUp30d: number | null
  epsRevisionsDown30d: number | null
  epsTrendCurrent: number | null
  epsTrend90dAgo: number | null
}

export interface MomentumScoreResult {
  score: number
  details: Record<string, string>
  priceOnly: boolean // true when EPS data is unavailable and score relies solely on price momentum
}

function computePriceMomentum(
  currentPrice: number,
  price3mAgo: number | null,
  price6mAgo: number | null,
  price12mAgo: number | null,
): { score: number; details: Record<string, string> } {
  let score = 50
  const details: Record<string, string> = {}

  // 3-month return (strongest weight among price signals)
  if (price3mAgo != null && price3mAgo > 0) {
    const ret = ((currentPrice - price3mAgo) / price3mAgo) * 100
    if (ret > 20) {
      score += 18
      details.return3m = `3M return +${ret.toFixed(1)}% — strong upward momentum`
    } else if (ret > 10) {
      score += 10
      details.return3m = `3M return +${ret.toFixed(1)}% — good momentum`
    } else if (ret > 0) {
      score += 4
      details.return3m = `3M return +${ret.toFixed(1)}% — mild positive`
    } else if (ret > -10) {
      score -= 5
      details.return3m = `3M return ${ret.toFixed(1)}% — mild negative`
    } else if (ret > -20) {
      score -= 12
      details.return3m = `3M return ${ret.toFixed(1)}% — poor momentum`
    } else {
      score -= 18
      details.return3m = `3M return ${ret.toFixed(1)}% — severe decline`
    }
  } else {
    details.return3m = "3-month data unavailable"
  }

  // 6-month return
  if (price6mAgo != null && price6mAgo > 0) {
    const ret = ((currentPrice - price6mAgo) / price6mAgo) * 100
    if (ret > 30) {
      score += 10
      details.return6m = `6M return +${ret.toFixed(1)}% — strong trend`
    } else if (ret > 10) {
      score += 5
      details.return6m = `6M return +${ret.toFixed(1)}% — positive trend`
    } else if (ret > 0) {
      score += 2
      details.return6m = `6M return +${ret.toFixed(1)}% — mild uptrend`
    } else if (ret > -15) {
      score -= 4
      details.return6m = `6M return ${ret.toFixed(1)}% — mild downtrend`
    } else {
      score -= 10
      details.return6m = `6M return ${ret.toFixed(1)}% — strong downtrend`
    }
  } else {
    details.return6m = "6-month data unavailable"
  }

  // 12-month return (trend confirmation)
  if (price12mAgo != null && price12mAgo > 0) {
    const ret = ((currentPrice - price12mAgo) / price12mAgo) * 100
    if (ret > 40) {
      score += 8
      details.return12m = `12M return +${ret.toFixed(1)}% — strong long-term trend`
    } else if (ret > 15) {
      score += 4
      details.return12m = `12M return +${ret.toFixed(1)}% — positive long-term trend`
    } else if (ret > 0) {
      score += 1
      details.return12m = `12M return +${ret.toFixed(1)}% — mild uptrend`
    } else if (ret > -20) {
      score -= 3
      details.return12m = `12M return ${ret.toFixed(1)}% — negative trend`
    } else {
      score -= 8
      details.return12m = `12M return ${ret.toFixed(1)}% — severe decline`
    }
  } else {
    details.return12m = "12-month data unavailable"
  }

  return { score: Math.max(0, Math.min(100, score)), details }
}

function computeEpsRevisionScore(
  revisionsUp: number | null,
  revisionsDown: number | null,
  epsCurrent: number | null,
  eps90dAgo: number | null,
): { score: number; details: Record<string, string> } {
  let score = 50
  const details: Record<string, string> = {}

  // Revision breadth: (up - down) / (up + down)
  if (revisionsUp != null && revisionsDown != null) {
    const total = revisionsUp + revisionsDown
    if (total > 0) {
      const breadth = (revisionsUp - revisionsDown) / total
      const breadthPoints = Math.round(breadth * 25) // -25 to +25

      score += breadthPoints

      if (breadth > 0.3) {
        details.epsBreadth = `EPS revisions: ${revisionsUp} up vs ${revisionsDown} down — strong positive breadth`
      } else if (breadth > 0) {
        details.epsBreadth = `EPS revisions: ${revisionsUp} up vs ${revisionsDown} down — mildly positive`
      } else if (breadth < -0.3) {
        details.epsBreadth = `EPS revisions: ${revisionsUp} up vs ${revisionsDown} down — strong negative breadth`
      } else if (breadth < 0) {
        details.epsBreadth = `EPS revisions: ${revisionsUp} up vs ${revisionsDown} down — mildly negative`
      } else {
        details.epsBreadth = `EPS revisions: ${revisionsUp} up vs ${revisionsDown} down — balanced`
      }
    } else {
      details.epsBreadth = "No recent EPS revisions"
    }
  } else {
    details.epsBreadth = "EPS revision data unavailable"
  }

  // Revision magnitude: % change in consensus EPS over 90 days
  if (epsCurrent != null && eps90dAgo != null && eps90dAgo !== 0) {
    const magPct = ((epsCurrent - eps90dAgo) / Math.abs(eps90dAgo)) * 100
    if (magPct > 10) {
      score += 20
      details.epsMagnitude = `Consensus EPS up ${magPct.toFixed(1)}% over 90 days — significant upgrade`
    } else if (magPct > 3) {
      score += 10
      details.epsMagnitude = `Consensus EPS up ${magPct.toFixed(1)}% over 90 days — positive revision`
    } else if (magPct > -3) {
      details.epsMagnitude = `Consensus EPS change ${magPct.toFixed(1)}% over 90 days — stable`
    } else if (magPct > -10) {
      score -= 10
      details.epsMagnitude = `Consensus EPS down ${magPct.toFixed(1)}% over 90 days — negative revision`
    } else {
      score -= 20
      details.epsMagnitude = `Consensus EPS down ${magPct.toFixed(1)}% over 90 days — significant downgrade`
    }
  } else {
    details.epsMagnitude = "EPS trend comparison unavailable"
  }

  return { score: Math.max(0, Math.min(100, score)), details }
}

export function computeMomentumScore(input: MomentumInput): MomentumScoreResult {
  const priceResult = computePriceMomentum(
    input.currentPrice,
    input.price3mAgo,
    input.price6mAgo,
    input.price12mAgo,
  )

  const epsResult = computeEpsRevisionScore(
    input.epsRevisionsUp30d,
    input.epsRevisionsDown30d,
    input.epsTrendCurrent,
    input.epsTrend90dAgo,
  )

  // Combine: price 40%, EPS revisions 60% (EPS is more durable alpha)
  const hasEpsData =
    input.epsRevisionsUp30d != null || input.epsTrendCurrent != null

  let score: number
  const priceOnly = !hasEpsData
  if (hasEpsData) {
    score = Math.round(priceResult.score * 0.4 + epsResult.score * 0.6)
  } else {
    // Fall back to price-only if no EPS data
    score = priceResult.score
  }

  const details = { ...priceResult.details, ...epsResult.details }
  if (priceOnly) {
    details.warning = "No EPS revision data — momentum score based on price action only (less reliable)"
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    details,
    priceOnly,
  }
}

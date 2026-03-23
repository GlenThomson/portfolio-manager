/**
 * Growth & Earnings Power score (0-100) — is the business growing and improving?
 *
 * For long-term investors, this captures whether the company is on an upward trajectory.
 * Combines backward-looking growth metrics with forward-looking EPS revisions.
 *
 * Sub-scores:
 *   EPS revision breadth: 30% — are analysts upgrading or downgrading?
 *   EPS revision magnitude: 20% — how much are estimates changing?
 *   Revenue growth: 25% — top-line growth
 *   EPS growth: 25% — bottom-line growth
 */

export interface GrowthInput {
  revenueGrowth: number | null  // decimal (0.15 = 15%)
  epsGrowth: number | null      // decimal
  epsRevisionsUp30d: number | null
  epsRevisionsDown30d: number | null
  epsTrendCurrent: number | null
  epsTrend90dAgo: number | null
}

export interface GrowthScoreResult {
  score: number
  details: Record<string, string>
}

function scoreRevenueGrowth(growth: number | null): { points: number; detail: string } {
  if (growth == null || isNaN(growth)) return { points: 50, detail: "Revenue growth unavailable" }

  const pct = growth * 100
  if (pct >= 30) return { points: 95, detail: `Revenue growth ${pct.toFixed(1)}% — exceptional` }
  if (pct >= 15) return { points: 80, detail: `Revenue growth ${pct.toFixed(1)}% — strong` }
  if (pct >= 5) return { points: 60, detail: `Revenue growth ${pct.toFixed(1)}% — moderate` }
  if (pct >= 0) return { points: 40, detail: `Revenue growth ${pct.toFixed(1)}% — flat` }
  if (pct >= -10) return { points: 25, detail: `Revenue growth ${pct.toFixed(1)}% — declining` }
  return { points: 10, detail: `Revenue growth ${pct.toFixed(1)}% — significant decline` }
}

function scoreEpsGrowth(growth: number | null): { points: number; detail: string } {
  if (growth == null || isNaN(growth)) return { points: 50, detail: "EPS growth unavailable" }

  const pct = growth * 100
  if (pct >= 30) return { points: 95, detail: `EPS growth ${pct.toFixed(1)}% — exceptional` }
  if (pct >= 15) return { points: 80, detail: `EPS growth ${pct.toFixed(1)}% — strong` }
  if (pct >= 5) return { points: 60, detail: `EPS growth ${pct.toFixed(1)}% — moderate` }
  if (pct >= 0) return { points: 40, detail: `EPS growth ${pct.toFixed(1)}% — flat` }
  if (pct >= -15) return { points: 25, detail: `EPS growth ${pct.toFixed(1)}% — declining` }
  return { points: 10, detail: `EPS growth ${pct.toFixed(1)}% — significant decline` }
}

function scoreEpsRevisionBreadth(
  up: number | null,
  down: number | null,
): { points: number; detail: string } {
  if (up == null || down == null) return { points: 50, detail: "EPS revision data unavailable" }

  const total = up + down
  if (total === 0) return { points: 50, detail: "No recent EPS revisions" }

  const breadth = (up - down) / total

  if (breadth >= 0.6) return { points: 90, detail: `EPS revisions: ${up} up vs ${down} down — strongly positive` }
  if (breadth >= 0.2) return { points: 70, detail: `EPS revisions: ${up} up vs ${down} down — positive` }
  if (breadth >= -0.2) return { points: 50, detail: `EPS revisions: ${up} up vs ${down} down — mixed` }
  if (breadth >= -0.6) return { points: 30, detail: `EPS revisions: ${up} up vs ${down} down — negative` }
  return { points: 10, detail: `EPS revisions: ${up} up vs ${down} down — strongly negative` }
}

function scoreEpsRevisionMagnitude(
  current: number | null,
  ago90d: number | null,
): { points: number; detail: string } {
  if (current == null || ago90d == null || ago90d === 0) {
    return { points: 50, detail: "EPS trend comparison unavailable" }
  }

  const magPct = ((current - ago90d) / Math.abs(ago90d)) * 100

  if (magPct >= 15) return { points: 90, detail: `Consensus EPS up ${magPct.toFixed(1)}% over 90 days — significant upgrade` }
  if (magPct >= 5) return { points: 70, detail: `Consensus EPS up ${magPct.toFixed(1)}% over 90 days — positive revision` }
  if (magPct >= -5) return { points: 50, detail: `Consensus EPS change ${magPct.toFixed(1)}% over 90 days — stable` }
  if (magPct >= -15) return { points: 30, detail: `Consensus EPS down ${magPct.toFixed(1)}% over 90 days — negative revision` }
  return { points: 10, detail: `Consensus EPS down ${magPct.toFixed(1)}% over 90 days — significant downgrade` }
}

export function computeGrowthScore(input: GrowthInput): GrowthScoreResult {
  const revBreadth = scoreEpsRevisionBreadth(input.epsRevisionsUp30d, input.epsRevisionsDown30d)
  const revMagnitude = scoreEpsRevisionMagnitude(input.epsTrendCurrent, input.epsTrend90dAgo)
  const revGrowth = scoreRevenueGrowth(input.revenueGrowth)
  const epsGrowth = scoreEpsGrowth(input.epsGrowth)

  const score = Math.round(
    revBreadth.points * 0.30 +
    revMagnitude.points * 0.20 +
    revGrowth.points * 0.25 +
    epsGrowth.points * 0.25
  )

  return {
    score: Math.max(0, Math.min(100, score)),
    details: {
      epsBreadth: revBreadth.detail,
      epsMagnitude: revMagnitude.detail,
      revenueGrowth: revGrowth.detail,
      epsGrowth: epsGrowth.detail,
    },
  }
}

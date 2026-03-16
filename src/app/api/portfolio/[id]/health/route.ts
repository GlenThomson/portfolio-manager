import { NextRequest, NextResponse } from "next/server"
import { eq, and, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { portfolios, portfolioPositions } from "@/lib/db/schema"
import { getServerUserId } from "@/lib/supabase/server"
import { analyzePortfolioHealth } from "@/lib/scoring/portfolio-health"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let userId: string
  try {
    userId = await getServerUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const portfolioId = params.id

  // Verify portfolio belongs to user
  const [portfolio] = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)))

  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
  }

  // Fetch open positions
  const positions = await db
    .select()
    .from(portfolioPositions)
    .where(
      and(
        eq(portfolioPositions.portfolioId, portfolioId),
        eq(portfolioPositions.userId, userId),
        isNull(portfolioPositions.closedAt)
      )
    )

  // Filter out cash positions
  const stockPositions = positions
    .filter((p) => p.assetType !== "cash")
    .map((p) => ({
      symbol: p.symbol,
      quantity: Number(p.quantity),
      averageCost: Number(p.averageCost),
    }))

  const report = await analyzePortfolioHealth(stockPositions)

  return NextResponse.json(report)
}

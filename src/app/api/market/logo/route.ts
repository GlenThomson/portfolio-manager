import { NextResponse } from "next/server"
import { getCompanyProfile } from "@/lib/market/finnhub"
import { isValidSymbol } from "@/lib/validation"

export const maxDuration = 15

/**
 * GET /api/market/logo?symbol=TSLA
 * Returns { symbol, logo: url|null, name } — logos rarely change, cached aggressively.
 * Public route (no user data exposed).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const symbol = url.searchParams.get("symbol")
  if (!isValidSymbol(symbol)) {
    return NextResponse.json({ error: "Valid symbol required" }, { status: 400 })
  }
  const sym = symbol!.toUpperCase().trim()

  try {
    const profile = await getCompanyProfile(sym)
    return NextResponse.json(
      {
        symbol: sym,
        logo: profile?.logo ?? null,
        name: profile?.name ?? sym,
      },
      {
        headers: {
          // Cache aggressively on CDN edge — logos don't change. 7d shared, 30d browser.
          "Cache-Control": "public, s-maxage=604800, max-age=2592000, stale-while-revalidate=86400",
        },
      },
    )
  } catch {
    return NextResponse.json({ symbol: sym, logo: null, name: sym })
  }
}

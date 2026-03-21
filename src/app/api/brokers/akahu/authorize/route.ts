import { NextRequest, NextResponse } from "next/server"
import { getAuthorizeUrl } from "@/lib/brokers/akahu"
import { getServerUserId } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const userId = await getServerUserId()

  const { searchParams } = new URL(request.url)
  const portfolioId = searchParams.get("portfolioId")
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  const state = Buffer.from(JSON.stringify({ userId, portfolioId })).toString("base64url")
  const url = getAuthorizeUrl(state)

  return NextResponse.redirect(url)
}

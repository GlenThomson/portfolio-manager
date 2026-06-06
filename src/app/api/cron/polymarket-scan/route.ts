import { NextRequest, NextResponse } from "next/server"
import { scanForAllUsers } from "@/lib/polymarket/scan"

export const maxDuration = 60

/**
 * Vercel cron — runs the Polymarket scan for every user with scan_enabled=true.
 * Auth via CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await scanForAllUsers()
    return NextResponse.json(result)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

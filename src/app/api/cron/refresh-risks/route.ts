import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { computeAllRisksForUser } from "@/lib/risks/compute"

export const maxDuration = 60

/**
 * Vercel cron endpoint — refreshes risk monitor scores for all users.
 * Unlike /api/cron/daily-digest, this DOES NOT send an email. It only
 * recomputes scores and lets the normal inbox-alert logic fire.
 *
 * Scheduled twice per day (see vercel.json) so users see movement during
 * the US trading day + after close, without getting spammed with emails.
 *
 * Auth via CRON_SECRET (Vercel cron sends Authorization: Bearer <secret>).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const providedSecret = request.nextUrl.searchParams.get("secret")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const authorized =
    authHeader === `Bearer ${expectedSecret}` || providedSecret === expectedSecret
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 })
  }
  const supabase = createServiceClient(url, key, { auth: { persistSession: false } })

  // Find all users who have at least one active risk monitor — process only them
  const { data: monitors } = await supabase
    .from("risk_monitors")
    .select("user_id")
    .eq("is_active", true)

  const userIds = Array.from(new Set((monitors ?? []).map((m) => m.user_id)))

  const results: { userId: string; computed: number; failed: number }[] = []
  for (const userId of userIds) {
    try {
      const r = await computeAllRisksForUser(userId)
      results.push({ userId, computed: r.computed, failed: r.failed })
    } catch (err) {
      console.error(`Refresh risks failed for user ${userId}:`, err)
      results.push({ userId, computed: 0, failed: 1 })
    }
  }

  return NextResponse.json({
    usersProcessed: userIds.length,
    totalComputed: results.reduce((s, r) => s + r.computed, 0),
    totalFailed: results.reduce((s, r) => s + r.failed, 0),
    results,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { generateDigestForUser, persistDigest } from "@/lib/digest/generate"
import { sendDigestEmail } from "@/lib/email/digest"
import { computeAllRisksForUser } from "@/lib/risks/compute"

export const maxDuration = 60

/**
 * Vercel cron endpoint — fires once per day (see vercel.json).
 * Iterates all users with digests enabled, generates + sends their digest.
 *
 * Auth:
 *  - Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 *  - For manual testing append `?secret=<CRON_SECRET>` (not for production use).
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

  // Load all users with profiles (we'll filter by digest opt-in)
  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, settings")
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  type ProfileRow = {
    user_id: string
    display_name: string | null
    settings: Record<string, unknown> | null
  }

  const rows = (profiles ?? []) as ProfileRow[]

  const results: { userId: string; status: string; detail?: string }[] = []

  for (const profile of rows) {
    const settings = (profile.settings ?? {}) as { dailyDigest?: boolean }
    // Opt-in gate: user must have dailyDigest=true. Default off for safety.
    if (settings.dailyDigest !== true) {
      results.push({ userId: profile.user_id, status: "skipped_opt_out" })
      continue
    }

    // Look up email via auth admin
    const { data: authUser } = await supabase.auth.admin.getUserById(profile.user_id)
    const email = authUser?.user?.email
    if (!email) {
      results.push({ userId: profile.user_id, status: "skipped_no_email" })
      continue
    }

    try {
      // Refresh all risk monitor scores first so the digest includes fresh numbers.
      // Non-blocking for email — if this fails, digest still goes with stale risk scores.
      try { await computeAllRisksForUser(profile.user_id) } catch {}

      const content = await generateDigestForUser(profile.user_id)

      // Skip empty portfolios silently
      if (content.portfolio.positionCount === 0) {
        results.push({ userId: profile.user_id, status: "skipped_empty_portfolio" })
        continue
      }

      const emailResult = await sendDigestEmail(email, content, profile.display_name ?? undefined)
      await persistDigest(profile.user_id, content)

      // Record email status
      await supabase.from("digest_runs").update({
        email_sent_at: emailResult.ok ? new Date().toISOString() : null,
        email_error: emailResult.ok ? null : emailResult.error,
      }).eq("user_id", profile.user_id).eq("digest_date", content.date)

      results.push({
        userId: profile.user_id,
        status: emailResult.ok ? "sent" : "email_failed",
        detail: emailResult.ok ? undefined : emailResult.error,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`Digest failed for user ${profile.user_id}:`, detail)
      results.push({ userId: profile.user_id, status: "error", detail })
    }
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status.startsWith("skipped")).length,
    failed: results.filter((r) => r.status === "error" || r.status === "email_failed").length,
    results,
  })
}

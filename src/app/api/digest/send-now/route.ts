import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateDigestForUser, persistDigest } from "@/lib/digest/generate"
import { sendDigestEmail } from "@/lib/email/digest"

export const maxDuration = 30

/**
 * Generate and send the current user's digest immediately.
 * For the "Send me a digest now" button in settings.
 */
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const email = user.email
  if (!email) return NextResponse.json({ error: "No email on account" }, { status: 400 })

  const { data: profile } = await supabase
    .from("user_profiles").select("display_name").eq("user_id", user.id).single()

  try {
    const content = await generateDigestForUser(user.id)
    if (content.portfolio.positionCount === 0) {
      return NextResponse.json(
        { error: "You have no open positions to report on yet." },
        { status: 400 },
      )
    }
    const result = await sendDigestEmail(email, content, profile?.display_name ?? undefined)
    await persistDigest(user.id, content)

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Email send failed" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, sentTo: email, summary: {
      positions: content.portfolio.positionCount,
      actionItems: content.actionRequired.length,
    } })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

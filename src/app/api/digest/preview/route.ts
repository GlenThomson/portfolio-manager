import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateDigestForUser } from "@/lib/digest/generate"
import { renderDigestHtml } from "@/lib/email/digest"

export const maxDuration = 30

/**
 * Preview the current user's digest. Returns HTML if ?format=html, otherwise JSON.
 * Does NOT send email or persist. Useful for "preview" button in settings.
 */
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("user_profiles").select("display_name").eq("user_id", user.id).single()

  try {
    const content = await generateDigestForUser(user.id)
    const url = new URL(request.url)
    if (url.searchParams.get("format") === "html") {
      const html = renderDigestHtml(content, profile?.display_name ?? undefined)
      return new NextResponse(html, { headers: { "Content-Type": "text/html" } })
    }
    return NextResponse.json(content)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

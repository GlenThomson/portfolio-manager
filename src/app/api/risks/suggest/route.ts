import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { suggestKeywordsForRisk } from "@/lib/risks/ai-scorer"

export const maxDuration = 30

/**
 * POST /api/risks/suggest { title, description }
 * Returns AI-suggested keywords + linked tickers. Does not persist — UI uses
 * them to prefill the create form.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, description } = await request.json().catch(() => ({}))
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  const result = await suggestKeywordsForRisk(title, description ?? "")
  return NextResponse.json(result)
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const maxDuration = 15

/**
 * Diagnostic: lists every asset with its inferred source.
 * REMOVE after debugging.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, type, value, currency, notes, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  const classified = (assets ?? []).map((a) => {
    const notes = a.notes ?? ""
    let source: string
    let detail: string | null = null

    if (notes.startsWith("akahu-wallet-")) {
      source = "SYNCED: Akahu investment account wallet/PIE (NEW from recent fix)"
      detail = `akahu account id = ${notes.replace("akahu-wallet-", "")}`
    } else if (notes.startsWith("akahu-")) {
      source = "SYNCED: Akahu bank/credit/loan/kiwisaver"
      detail = `akahu account id = ${notes.replace("akahu-", "")}`
    } else if (notes) {
      source = "MANUAL (with notes)"
      detail = notes
    } else {
      source = "MANUAL"
    }

    return {
      name: a.name,
      type: a.type,
      value: Number(a.value),
      currency: a.currency,
      source,
      detail,
      created: a.created_at,
      lastUpdated: a.updated_at,
    }
  })

  return NextResponse.json({
    totalCount: classified.length,
    bySource: {
      manual: classified.filter((c) => c.source.startsWith("MANUAL")).length,
      akahuBank: classified.filter((c) => c.source.includes("bank/credit")).length,
      akahuWallet: classified.filter((c) => c.source.includes("wallet/PIE")).length,
    },
    assets: classified,
  })
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fetchAllAccounts } from "@/lib/brokers/akahu"

export const maxDuration = 30

/**
 * Diagnostic: lists every Akahu account vs what's stored in our assets table.
 * Auth via user session. REMOVE after debugging.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: conn } = await supabase
    .from("broker_connections")
    .select("access_token, account_id, last_sync_at")
    .eq("user_id", user.id).eq("broker", "akahu").limit(1).single()
  if (!conn?.access_token) return NextResponse.json({ error: "No Akahu connection" }, { status: 404 })

  // Fetch raw from Akahu
  let akahuAccounts: Array<{ id: string; name: string; type: string; connectionName: string; balance: number; currency: string }> = []
  let akahuError: string | null = null
  try {
    akahuAccounts = await fetchAllAccounts(conn.access_token, conn.account_id ?? undefined)
  } catch (err) {
    akahuError = err instanceof Error ? err.message : String(err)
  }

  // Get our stored assets
  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, type, value, currency, notes, updated_at")
    .eq("user_id", user.id)

  // Map by akahu ref
  const assetByRef = new Map<string, typeof assets[number]>()
  for (const a of assets ?? []) {
    if (a.notes?.startsWith("akahu-")) assetByRef.set(a.notes, a)
  }

  // Build diff
  const ACCOUNT_TYPE_MAP: Record<string, string> = {
    SAVINGS: "cash",
    CHECKING: "cash",
    TERM_DEPOSIT: "cash",
    CREDITCARD: "credit-card",
    LOAN: "loan",
    KIWISAVER: "kiwisaver",
  }

  const diff = akahuAccounts.map((acc) => {
    const ref = `akahu-${acc.id}`
    const stored = assetByRef.get(ref)
    const wouldSync = !!ACCOUNT_TYPE_MAP[acc.type]
    return {
      name: acc.name,
      connection: acc.connectionName,
      type: acc.type,
      mapsTo: ACCOUNT_TYPE_MAP[acc.type] ?? null,
      balance: acc.balance,
      currency: acc.currency,
      stored: stored ? { value: Number(stored.value), updated_at: stored.updated_at } : null,
      status: !wouldSync
        ? `SKIPPED — type "${acc.type}" not in sync map`
        : stored
          ? Math.abs(Number(stored.value) - Math.abs(acc.balance)) < 0.01
            ? "ok"
            : "value_mismatch"
          : "not_stored",
    }
  })

  // Also list assets that have akahu- prefix but no longer match an Akahu account (stale)
  const stale: Array<{ name: string; type: string; value: number; notes: string }> = []
  const validRefs = new Set(akahuAccounts.map((a) => `akahu-${a.id}`))
  for (const a of assets ?? []) {
    if (a.notes?.startsWith("akahu-") && !validRefs.has(a.notes)) {
      stale.push({ name: a.name, type: a.type, value: Number(a.value), notes: a.notes })
    }
  }

  return NextResponse.json({
    lastSyncAt: conn.last_sync_at,
    akahuError,
    summary: {
      akahuAccountsTotal: akahuAccounts.length,
      synced: diff.filter((d) => d.status === "ok").length,
      mismatches: diff.filter((d) => d.status === "value_mismatch").length,
      notStored: diff.filter((d) => d.status === "not_stored").length,
      skipped: diff.filter((d) => d.status.startsWith("SKIPPED")).length,
      staleInDb: stale.length,
    },
    accounts: diff,
    staleAssets: stale,
  })
}

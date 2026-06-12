import { NextResponse } from "next/server"
import { fetchAllAccounts, fetchInvestmentAccounts } from "@/lib/brokers/akahu"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export const maxDuration = 60

/**
 * POST /api/brokers/akahu/sync-bank
 *
 * Syncs bank account balances → assets table for net worth tracking.
 */
export async function POST() {
  const supabase = createClient()
  const userId = await getServerUserId()

  // Get Akahu token
  const { data: connection } = await supabase
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("broker", "akahu")
    .limit(1)
    .single()

  const accessToken = connection?.access_token
  const appToken = connection?.account_id
  if (!accessToken || !appToken) {
    return NextResponse.json(
      { error: "No Akahu connection found. Connect via Settings to sync bank accounts." },
      { status: 400 }
    )
  }

  try {
    const accounts = await fetchAllAccounts(accessToken, appToken)

    // Respect the user's ignore list — refs they've explicitly deleted shouldn't be recreated.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("settings")
      .eq("user_id", userId)
      .single()
    const ignoredRefs = new Set<string>(
      ((profile?.settings ?? {}) as { ignoredAkahuRefs?: string[] }).ignoredAkahuRefs ?? [],
    )

    // Map Akahu account types to our asset types
    const ACCOUNT_TYPE_MAP: Record<string, string> = {
      SAVINGS: "cash",
      CHECKING: "cash",
      TERM_DEPOSIT: "cash",
      CREDITCARD: "credit-card",
      LOAN: "loan",
      KIWISAVER: "kiwisaver",
    }

    let balancesUpdated = 0

    // Helper: upsert one account into the assets table
    const upsertAsset = async (ref: string, name: string, type: string, value: number, currency: string) => {
      const { data: existing } = await supabase
        .from("assets")
        .select("id")
        .eq("user_id", userId)
        .eq("notes", ref)
        .limit(1)
        .single()

      if (existing) {
        await supabase
          .from("assets")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        await supabase.from("assets").insert({
          user_id: userId,
          name,
          type,
          value,
          currency,
          notes: ref,
        })
      }
      balancesUpdated++
    }

    // 1) Bank-type accounts (savings, checking, credit cards, loans, KiwiSaver)
    for (const account of accounts) {
      const assetType = ACCOUNT_TYPE_MAP[account.type]
      if (!assetType) continue // INVESTMENT handled separately below
      const ref = `akahu-${account.id}`
      if (ignoredRefs.has(ref)) continue
      await upsertAsset(ref, account.name, assetType, Math.abs(account.balance), account.currency)
    }

    // 2) Investment-account WALLET / PIE-savings balances.
    // For Sharesies, this is the uninvested cash sitting in your wallet.
    // For PIE savings products (Sharesies Save, Squirrel, etc) reported as INVESTMENT type,
    // this captures the entire balance since there are no holdings to subtract.
    try {
      const { walletBalances } = await fetchInvestmentAccounts(accessToken, appToken)
      for (const wb of walletBalances) {
        const ref = `akahu-wallet-${wb.accountId}`
        if (ignoredRefs.has(ref)) continue
        // Label the wallet entry clearly — for brokerage accounts like Sharesies
        // this is wallet + PIE Save + Spend + in-flight orders, all uninvested cash.
        const label = `${wb.name} — cash & savings`
        await upsertAsset(ref, label, "cash", wb.cashValue, wb.currency)
      }
    } catch (err) {
      // Don't fail the whole sync if just wallet retrieval errors
      console.error("Wallet balance sync failed:", err)
    }

    // Update last sync timestamp
    if (connection) {
      await supabase
        .from("broker_connections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", connection.id)
    }

    return NextResponse.json({ balancesUpdated })
  } catch (err) {
    console.error("Bank sync error:", err)
    return NextResponse.json(
      { error: "Failed to sync bank data. Please try again." },
      { status: 500 }
    )
  }
}

import { NextResponse } from "next/server"
import { fetchAllAccounts } from "@/lib/brokers/akahu"
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

    for (const account of accounts) {
      const assetType = ACCOUNT_TYPE_MAP[account.type]
      if (!assetType) continue // Skip INVESTMENT accounts (handled by investment sync)

      const akahuRef = `akahu-${account.id}`
      const balanceValue = Math.abs(account.balance)

      // Check if we already have this account as an asset
      const { data: existing } = await supabase
        .from("assets")
        .select("id")
        .eq("user_id", userId)
        .eq("notes", akahuRef)
        .limit(1)
        .single()

      if (existing) {
        await supabase
          .from("assets")
          .update({ value: balanceValue, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        await supabase
          .from("assets")
          .insert({
            user_id: userId,
            name: account.name,
            type: assetType,
            value: balanceValue,
            currency: account.currency,
            notes: akahuRef,
          })
      }
      balancesUpdated++
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

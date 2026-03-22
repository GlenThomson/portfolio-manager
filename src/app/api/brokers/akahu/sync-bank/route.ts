import { NextResponse } from "next/server"
import { fetchAllAccounts, fetchTransactions, getPersonalUserToken } from "@/lib/brokers/akahu"
import { categoriseTransactions, generateMatchPattern } from "@/lib/brokers/income-categoriser"
import { createClient, getServerUserId } from "@/lib/supabase/server"

export const maxDuration = 60

/**
 * POST /api/brokers/akahu/sync-bank
 *
 * Syncs bank account balances → assets table
 * Syncs income transactions → income_entries table (with auto-categorisation)
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

  const accessToken = connection?.access_token ?? getPersonalUserToken()
  if (!accessToken) {
    return NextResponse.json(
      { error: "No Akahu connection found. Connect via Settings or Investments page." },
      { status: 400 }
    )
  }

  try {
    // ── 1. Sync account balances → assets table ────────────

    const accounts = await fetchAllAccounts(accessToken)

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
      const isLiability = ["credit-card", "loan"].includes(assetType)
      const balanceValue = Math.abs(account.balance)

      // Check if we already have this account as an asset
      const { data: existing } = await supabase
        .from("assets")
        .select("id")
        .eq("user_id", userId)
        .eq("notes", akahuRef) // Use notes field to store akahu ref
        .limit(1)
        .single()

      if (existing) {
        // Update balance
        await supabase
          .from("assets")
          .update({ value: balanceValue, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
      } else {
        // Create new asset
        await supabase
          .from("assets")
          .insert({
            user_id: userId,
            name: account.name,
            type: isLiability ? assetType : assetType,
            value: balanceValue,
            currency: account.currency,
            notes: akahuRef,
          })
      }
      balancesUpdated++
    }

    // ── 2. Sync income transactions ──────────────────────

    // Fetch user's categorisation rules
    const { data: rules } = await supabase
      .from("income_rules")
      .select("match_pattern, category, source_label")
      .eq("user_id", userId)

    // Fetch transactions from last 90 days
    const rawTransactions = await fetchTransactions(accessToken)

    // Auto-categorise
    const categorised = categoriseTransactions(rawTransactions, rules ?? [])

    let incomeImported = 0
    let incomeSkipped = 0
    let needsReviewCount = 0

    for (const item of categorised) {
      const tx = item.transaction
      const bankRef = `akahu-${tx.id}`

      // Skip if already imported (dedup by bank_ref)
      const { data: existingTx } = await supabase
        .from("income_entries")
        .select("id")
        .eq("user_id", userId)
        .eq("bank_ref", bankRef)
        .limit(1)
        .single()

      if (existingTx) {
        incomeSkipped++
        continue
      }

      const category = item.category ?? "other"

      await supabase
        .from("income_entries")
        .insert({
          user_id: userId,
          source: item.sourceLabel,
          category,
          amount: tx.amount,
          currency: "NZD",
          date: tx.date.split("T")[0],
          origin: "bank",
          bank_ref: bankRef,
          needs_review: item.needsReview,
          notes: item.needsReview ? tx.description : null,
        })

      incomeImported++
      if (item.needsReview) needsReviewCount++
    }

    // Update last sync timestamp
    if (connection) {
      await supabase
        .from("broker_connections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", connection.id)
    }

    return NextResponse.json({
      balancesUpdated,
      incomeImported,
      incomeSkipped,
      needsReview: needsReviewCount,
      totalTransactions: categorised.length,
    })
  } catch (err) {
    console.error("Bank sync error:", err)
    return NextResponse.json(
      { error: "Failed to sync bank data. Please try again." },
      { status: 500 }
    )
  }
}

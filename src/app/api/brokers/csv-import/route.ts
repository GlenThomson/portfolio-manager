import { NextRequest, NextResponse } from "next/server"
import { parseCSVWithMapping, parseCSVHeaders } from "@/lib/brokers/csv-parser"
import type { ColumnMapping, CashMapping } from "@/lib/brokers/csv-parser"
import { createClient, getServerUserId } from "@/lib/supabase/server"

/** POST with just a file → returns headers + preview for mapping step */
/** POST with file + mapping → processes the import */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const userId = await getServerUserId()

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const portfolioId = formData.get("portfolioId") as string | null
  const mappingJson = formData.get("mapping") as string | null
  const cashMappingJson = formData.get("cashMapping") as string | null
  const replaceMode = formData.get("replace") === "true"

  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 })
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 })
  }

  const csvText = await file.text()

  // Step 1: No mapping provided → return headers + preview for the UI
  if (!mappingJson) {
    const { headers, preview } = parseCSVHeaders(csvText)
    return NextResponse.json({ headers, preview })
  }

  // Step 2: Mapping provided → parse and import
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 })
  }

  let mapping: ColumnMapping
  let cashMapping: CashMapping | undefined
  try {
    mapping = JSON.parse(mappingJson)
    if (cashMappingJson) cashMapping = JSON.parse(cashMappingJson)
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 })
  }

  if (!mapping.symbol || !mapping.quantity || (!mapping.price && !mapping.totalCost)) {
    return NextResponse.json({ error: "symbol, quantity, and price (or total cost) mappings are required" }, { status: 400 })
  }

  const { rows, errors } = parseCSVWithMapping(csvText, mapping, cashMapping)

  if (rows.length === 0) {
    return NextResponse.json({
      error: "No valid rows found after applying column mapping",
      parseErrors: errors,
    }, { status: 400 })
  }

  // Replace mode: delete all previously CSV-imported positions + transactions
  if (replaceMode) {
    // Delete transactions with csv- broker_ref prefix
    await supabase
      .from("transactions")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .like("broker_ref", "csv-%")

    // Delete positions that were CSV-imported (we'll recreate them)
    // We identify these by checking if all their transactions are csv-prefixed
    // Simplest: delete all open positions in this portfolio and let the import recreate them
    // But that would also delete manually-added positions. Instead, only delete cash positions
    // and positions whose symbols appear in this import.
    const importedSymbols = rows.map((r) => r.symbol)
    const uniqueSymbols = Array.from(new Set(importedSymbols))

    for (const sym of uniqueSymbols) {
      await supabase
        .from("portfolio_positions")
        .delete()
        .eq("portfolio_id", portfolioId)
        .eq("user_id", userId)
        .eq("symbol", sym)
        .is("closed_at", null)
    }

    // Also delete all cash positions (they'll be recreated from the CSV)
    await supabase
      .from("portfolio_positions")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .eq("asset_type", "cash")
  }

  let imported = 0
  let skipped = 0

  for (const row of rows) {
    // In replace mode, skip dedup (we just deleted everything)
    if (!replaceMode) {
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("broker_ref", row.brokerRef)
        .limit(1)
        .single()

      if (existingTx) {
        skipped++
        continue
      }
    }

    // Insert transaction (skip for cash — cash is just a position snapshot)
    if (row.assetType !== "cash") {
      await supabase.from("transactions").insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol: row.symbol,
        action: row.action,
        quantity: row.quantity.toString(),
        price: row.price.toString(),
        fees: row.fees.toString(),
        broker_ref: row.brokerRef,
        executed_at: row.executedAt,
      })
    }

    // Upsert position
    if (row.assetType === "cash") {
      // Cash: just insert/replace the position
      await supabase.from("portfolio_positions").insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol: row.symbol,
        quantity: "1",
        average_cost: row.price.toString(), // balance stored as average_cost
        asset_type: "cash",
      })
    } else if (row.action === "buy" || row.action === "sell") {
      const { data: existingPos } = await supabase
        .from("portfolio_positions")
        .select("id, quantity, average_cost")
        .eq("portfolio_id", portfolioId)
        .eq("symbol", row.symbol)
        .is("closed_at", null)
        .limit(1)
        .single()

      if (existingPos && row.action === "buy") {
        const oldQty = parseFloat(existingPos.quantity)
        const oldCost = parseFloat(existingPos.average_cost)
        const newQty = oldQty + row.quantity
        const newAvgCost = (oldQty * oldCost + row.quantity * row.price) / newQty

        await supabase
          .from("portfolio_positions")
          .update({
            quantity: newQty.toString(),
            average_cost: newAvgCost.toString(),
          })
          .eq("id", existingPos.id)
      } else if (existingPos && row.action === "sell") {
        const oldQty = parseFloat(existingPos.quantity)
        const newQty = oldQty - row.quantity

        if (newQty <= 0) {
          await supabase
            .from("portfolio_positions")
            .update({ quantity: "0", closed_at: new Date().toISOString() })
            .eq("id", existingPos.id)
        } else {
          await supabase
            .from("portfolio_positions")
            .update({ quantity: newQty.toString() })
            .eq("id", existingPos.id)
        }
      } else if (row.action === "buy") {
        await supabase.from("portfolio_positions").insert({
          portfolio_id: portfolioId,
          user_id: userId,
          symbol: row.symbol,
          quantity: row.quantity.toString(),
          average_cost: row.price.toString(),
          asset_type: "stock",
        })
      }
    }

    imported++
  }

  return NextResponse.json({
    imported,
    skipped,
    total: rows.length,
    parseErrors: errors.length > 0 ? errors : undefined,
  })
}

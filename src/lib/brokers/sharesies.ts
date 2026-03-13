/**
 * Sharesies CSV import parser
 *
 * Expected CSV columns (Sharesies transaction export):
 *   Date, Type, Fund/Company, Shares/Units, Price per share, Total, Currency
 *
 * We map "Buy" / "Sell" types to our transaction actions.
 * Dividend rows are mapped to "dividend" action.
 */

import Papa from "papaparse"

export interface ParsedTransaction {
  symbol: string
  action: "buy" | "sell" | "dividend"
  quantity: number
  price: number
  fees: number
  executedAt: string // ISO date
  brokerRef: string // dedup key
}

interface SharesiesRow {
  Date?: string
  Type?: string
  "Fund/Company"?: string
  "Shares/Units"?: string
  "Price per share"?: string
  Total?: string
  Currency?: string
  // Alternative column names
  date?: string
  type?: string
  fund?: string
  shares?: string
  price?: string
  total?: string
  currency?: string
}

function normalizeAction(type: string): ParsedTransaction["action"] | null {
  const t = type.toLowerCase().trim()
  if (t.includes("buy") || t.includes("purchase")) return "buy"
  if (t.includes("sell")) return "sell"
  if (t.includes("dividend")) return "dividend"
  return null
}

function parseDate(dateStr: string): string {
  // Handle DD/MM/YYYY (NZ format) and YYYY-MM-DD
  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/")
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000Z`
  }
  return new Date(dateStr).toISOString()
}

function extractSymbol(fundName: string): string {
  // If it looks like a ticker (all caps, short), use as-is
  const trimmed = fundName.trim()
  if (/^[A-Z]{1,5}$/.test(trimmed)) return trimmed
  // Otherwise use the first word uppercased as a best-effort ticker
  // Users can rename these after import
  return trimmed.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 10)
}

export function parseSharesiesCSV(csvText: string): {
  transactions: ParsedTransaction[]
  errors: string[]
} {
  const result = Papa.parse<SharesiesRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const transactions: ParsedTransaction[] = []
  const errors: string[] = []

  if (result.errors.length > 0) {
    errors.push(...result.errors.map((e) => `Row ${e.row}: ${e.message}`))
  }

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i]

    const dateStr = row.Date || row.date || ""
    const typeStr = row.Type || row.type || ""
    const fundStr = row["Fund/Company"] || row.fund || ""
    const sharesStr = row["Shares/Units"] || row.shares || ""
    const priceStr = row["Price per share"] || row.price || ""
    const totalStr = row.Total || row.total || ""

    if (!dateStr || !typeStr || !fundStr) {
      errors.push(`Row ${i + 2}: Missing required fields (Date, Type, Fund/Company)`)
      continue
    }

    const action = normalizeAction(typeStr)
    if (!action) {
      // Skip non-transaction rows (e.g. "Transfer", "Fee")
      continue
    }

    const shares = parseFloat(sharesStr) || 0
    const price = parseFloat(priceStr) || 0
    const total = parseFloat(totalStr) || 0

    // For dividends, quantity is 0, price is the total amount
    const quantity = action === "dividend" ? 0 : shares
    const pricePerShare = action === "dividend" ? total : price

    if (action !== "dividend" && quantity <= 0) {
      errors.push(`Row ${i + 2}: Invalid quantity for ${typeStr}`)
      continue
    }

    transactions.push({
      symbol: extractSymbol(fundStr),
      action,
      quantity,
      price: pricePerShare,
      fees: 0,
      executedAt: parseDate(dateStr),
      brokerRef: `sharesies-${dateStr}-${fundStr}-${typeStr}-${i}`,
    })
  }

  return { transactions, errors }
}

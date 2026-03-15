/**
 * Generic CSV parser with user-defined column mapping.
 * Works with any broker CSV — Sharesies, IBKR, Hatch, Stake, manual spreadsheets, etc.
 */

import Papa from "papaparse"

export interface ColumnMapping {
  symbol: string       // required — column name for ticker/symbol
  quantity: string     // required — column name for shares/units
  price: string        // required — column name for price per share or average cost
  action?: string      // optional — column name for buy/sell/dividend
  date?: string        // optional — column name for transaction date
  fees?: string        // optional — column name for fees
  totalCost?: string   // optional — column for total dollar cost (used to calculate avg cost = totalCost / quantity)
}

/** Columns mapped as cash balances (header → currency code) */
export interface CashMapping {
  [header: string]: string // e.g. "NZD Wallet (NZD)" → "NZD"
}

export interface ParsedRow {
  symbol: string
  quantity: number
  price: number
  action: "buy" | "sell" | "dividend"
  executedAt: string
  fees: number
  brokerRef: string
  assetType: "stock" | "cash"
}

function normalizeAction(value: string): ParsedRow["action"] | null {
  const v = value.toLowerCase().trim()
  if (v === "buy" || v.includes("purchase") || v.includes("bought")) return "buy"
  if (v === "sell" || v.includes("sold")) return "sell"
  if (v.includes("dividend")) return "dividend"
  return null
}

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString()
  // DD/MM/YYYY (NZ/AU/UK format)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split("/")
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00.000Z`
  }
  // MM/DD/YYYY (US format)
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
    const [a, b, y] = dateStr.split("/")
    const year = parseInt(y) + 2000
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}T00:00:00.000Z`
  }
  // ISO or other parseable format
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Parse a CSV string using the provided column mapping */
export function parseCSVWithMapping(
  csvText: string,
  mapping: ColumnMapping,
  cashMapping?: CashMapping
): { rows: ParsedRow[]; headers: string[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields ?? []
  const rows: ParsedRow[] = []
  const errors: string[] = []

  if (result.errors.length > 0) {
    errors.push(...result.errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`))
  }

  // For cash: use the LAST row (most recent snapshot) if there are multiple rows
  if (cashMapping && Object.keys(cashMapping).length > 0 && result.data.length > 0) {
    const lastRow = result.data[result.data.length - 1]
    for (const [header, currency] of Object.entries(cashMapping)) {
      const val = parseFloat(lastRow[header] ?? "0")
      if (val > 0) {
        rows.push({
          symbol: `${currency}-CASH`,
          quantity: 1,
          price: val,
          action: "buy",
          executedAt: new Date().toISOString(),
          fees: 0,
          brokerRef: `csv-cash-${currency}`,
          assetType: "cash",
        })
      }
    }
  }

  for (let i = 0; i < result.data.length; i++) {
    const raw = result.data[i]
    const rowNum = i + 2 // 1-indexed + header row

    const symbolVal = raw[mapping.symbol]?.trim().toUpperCase()
    const qtyVal = parseFloat(raw[mapping.quantity] ?? "")
    let priceVal = mapping.price ? parseFloat(raw[mapping.price] ?? "") : 0

    // If totalCost column is mapped, calculate avg cost = totalCost / quantity (overrides price)
    if (mapping.totalCost) {
      const totalCostVal = parseFloat(raw[mapping.totalCost] ?? "")
      if (!isNaN(totalCostVal) && totalCostVal > 0 && qtyVal > 0) {
        priceVal = totalCostVal / qtyVal
      }
    }

    if (!symbolVal) {
      errors.push(`Row ${rowNum}: Missing symbol`)
      continue
    }
    if (isNaN(qtyVal) || qtyVal <= 0) {
      errors.push(`Row ${rowNum}: Invalid quantity "${raw[mapping.quantity]}"`)
      continue
    }
    if (isNaN(priceVal) || priceVal < 0) {
      errors.push(`Row ${rowNum}: Invalid price "${raw[mapping.price]}"`)
      continue
    }

    // Determine action
    let action: ParsedRow["action"] = "buy" // default
    if (mapping.action && raw[mapping.action]) {
      const parsed = normalizeAction(raw[mapping.action])
      if (parsed) {
        action = parsed
      } else {
        errors.push(`Row ${rowNum}: Unknown action "${raw[mapping.action]}", defaulting to "buy"`)
      }
    }

    const dateStr = mapping.date ? raw[mapping.date] ?? "" : ""
    const fees = mapping.fees ? parseFloat(raw[mapping.fees] ?? "0") || 0 : 0

    rows.push({
      symbol: symbolVal,
      quantity: qtyVal,
      price: priceVal,
      action,
      executedAt: parseDate(dateStr),
      fees,
      brokerRef: `csv-${symbolVal}-${dateStr || i}-${action}-${qtyVal}`,
      assetType: "stock",
    })
  }

  return { rows, headers, errors }
}

/** Just parse headers from CSV text (for the preview/mapping step) */
export function parseCSVHeaders(csvText: string): {
  headers: string[]
  preview: Record<string, string>[]
} {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    preview: 5, // only parse first 5 rows for preview
  })

  return {
    headers: result.meta.fields ?? [],
    preview: result.data,
  }
}

export type BrokerFormat = "sharesies" | "ibkr" | "generic"

export interface BrokerDetectionResult {
  broker: BrokerFormat
  suggestedMapping: ColumnMapping
}

/** Auto-detect broker format from CSV headers and return a suggested column mapping */
export function detectBrokerFormat(headers: string[]): BrokerDetectionResult {
  const lower = headers.map((h) => h.toLowerCase())

  // Sharesies: "Investment ticker symbol", "Ending shareholding", "Dollar value of shares purchased..."
  if (
    lower.some((h) => h.includes("investment ticker symbol")) &&
    lower.some((h) => h.includes("ending shareholding"))
  ) {
    const symbolCol = headers.find((h) => h.toLowerCase().includes("investment ticker symbol")) ?? ""
    const quantityCol = headers.find((h) => h.toLowerCase().includes("ending shareholding")) ?? ""
    const totalCostCol = headers.find((h) =>
      h.toLowerCase().includes("dollar value of shares purchased")
    ) ?? ""
    const feesCol = headers.find((h) => h.toLowerCase().includes("transaction fees")) ?? ""

    return {
      broker: "sharesies",
      suggestedMapping: {
        symbol: symbolCol,
        quantity: quantityCol,
        price: "", // calculated from totalCost / quantity
        totalCost: totalCostCol,
        fees: feesCol || undefined,
        // No action column — snapshot report, all are buys
        // No date column — snapshot, not transaction log
      },
    }
  }

  // IBKR: "Symbol", "Quantity", "Average Cost", "Financial Instrument" etc.
  if (
    lower.some((h) => h === "financial instrument" || h === "asset category") &&
    lower.some((h) => h === "symbol") &&
    lower.some((h) => h === "quantity" || h === "position")
  ) {
    const symbolCol = headers.find((h) => h.toLowerCase() === "symbol") ?? ""
    const quantityCol = headers.find((h) =>
      h.toLowerCase() === "quantity" || h.toLowerCase() === "position"
    ) ?? ""
    const priceCol = headers.find((h) =>
      h.toLowerCase() === "average cost" || h.toLowerCase() === "cost basis"
    ) ?? ""
    const feesCol = headers.find((h) => h.toLowerCase() === "commission") ?? ""

    return {
      broker: "ibkr",
      suggestedMapping: {
        symbol: symbolCol,
        quantity: quantityCol,
        price: priceCol,
        fees: feesCol || undefined,
      },
    }
  }

  return {
    broker: "generic",
    suggestedMapping: {
      symbol: "",
      quantity: "",
      price: "",
    },
  }
}

/** Auto-detect cash/wallet columns from headers */
export function detectCashColumns(headers: string[]): CashMapping {
  const cash: CashMapping = {}
  for (const h of headers) {
    const lower = h.toLowerCase()
    if (lower.includes("wallet") || (lower.includes("cash") && lower.includes("balance"))) {
      // Extract currency from parentheses like "NZD Wallet (NZD)" or from the name
      const parenMatch = h.match(/\(([A-Z]{3})\)/)
      if (parenMatch) {
        cash[h] = parenMatch[1]
      } else {
        // Try to extract from start: "NZD Wallet" → "NZD"
        const wordMatch = h.match(/^([A-Z]{3})\s/i)
        if (wordMatch) {
          cash[h] = wordMatch[1].toUpperCase()
        }
      }
    }
  }
  return cash
}

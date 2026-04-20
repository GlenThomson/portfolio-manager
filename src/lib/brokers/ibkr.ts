/**
 * Interactive Brokers IBRIT Web Service client — read-only portfolio sync.
 *
 * Each user enables the PortfolioAI third-party feed in their IBKR Client Portal,
 * receives a unique token + query ID, and enters them into the app.
 * We fetch their daily position file via a simple GET request.
 *
 * Docs: https://www.interactivebrokers.com/campus/ibkr-reporting/reporting-integration/
 */

const IBRIT_BASE = "https://ndcdyn.interactivebrokers.com/Reporting/IBRITService"

// Service code assigned by IBKR for PortfolioAI
const SERVICE_CODE = process.env.IBKR_SERVICE_CODE ?? ""

export interface IBRITCredentials {
  token: string   // unique per user (t= param)
  queryId: string // unique per user (q= param)
}

export interface NormalizedPosition {
  symbol: string
  quantity: number
  averageCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  assetType: "stock" | "etf" | "crypto" | "option" | "bond" | "other" | "cash"
  currency: string
  brokerRef: string
  // Option-specific fields
  optionUnderlying?: string
  optionExpiry?: string
  optionStrike?: number
  optionType?: "C" | "P"
  optionMultiplier?: number
}

/** Error codes from IBRIT web service */
const IBRIT_ERRORS: Record<string, string> = {
  "1050": "Required parameters missing from request",
  "1052": "Invalid token or query ID — please check your credentials",
  "1053": "Invalid service code — contact support",
  "1054": "Service not enabled for web service delivery",
  "1055": "Report date is in the future",
  "1056": "Invalid date format",
  "1010": "No statement available for this date — try a recent business day",
}

/**
 * Fetch a report file from IBRIT web service.
 * Returns the raw CSV text.
 */
async function fetchReport(
  credentials: IBRITCredentials,
  reportDate: string // yyyymmdd format
): Promise<string> {
  if (!SERVICE_CODE) {
    throw new Error("IBKR_SERVICE_CODE not configured — ask admin to set it up")
  }

  const url = `${IBRIT_BASE}?t=${encodeURIComponent(credentials.token)}&q=${encodeURIComponent(credentials.queryId)}&rd=${reportDate}&s=${SERVICE_CODE}`

  const res = await fetch(url, { cache: "no-store" })

  if (!res.ok) {
    const text = await res.text()
    for (const [code, message] of Object.entries(IBRIT_ERRORS)) {
      if (text.includes(code)) {
        throw new Error(message)
      }
    }
    throw new Error(`IBKR report fetch failed: ${res.status}`)
  }

  return res.text()
}

/**
 * Parse a CSV line handling quoted fields with commas inside.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/**
 * Map IBKR asset type codes to our enum.
 */
function mapAssetType(ibkrType: string): NormalizedPosition["assetType"] {
  const t = ibkrType.toUpperCase().trim()
  if (t === "STK") return "stock"
  if (t === "OPT") return "option"
  if (t === "FUT" || t === "BOND" || t === "BILL") return "bond"
  if (t === "CASH") return "cash"
  if (t === "CRYPTO") return "crypto"
  // ETFs come through as STK in IBKR, we'll identify them from Security file if available
  return "other"
}

/**
 * Parse option symbol formats:
 * - Human readable: "MSTR 27MAR26 152.5 C"
 * - OCC-style: "MSTR  260327C00152500"
 */
function parseOptionSymbol(symbol: string): {
  underlying: string
  expiry: string
  strike: number
  type: "C" | "P"
} | null {
  // Human-readable: "MSTR 27MAR26 152.5 C"
  const humanMatch = symbol.match(
    /^(\w+)\s+(\d{1,2})([A-Z]{3})(\d{2})\s+([\d.]+)\s+([CP])$/
  )
  if (humanMatch) {
    const [, underlying, day, monthStr, year, strike, type] = humanMatch
    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
    }
    const month = months[monthStr] ?? "01"
    return {
      underlying,
      expiry: `20${year}-${month}-${day.padStart(2, "0")}`,
      strike: parseFloat(strike),
      type: type as "C" | "P",
    }
  }

  // OCC-style: "MSTR  260327C00152500"
  const occMatch = symbol.match(
    /^(\w+)\s+(\d{6})([CP])(\d{8})$/
  )
  if (occMatch) {
    const [, underlying, dateStr, type, strikeStr] = occMatch
    const year = `20${dateStr.slice(0, 2)}`
    const month = dateStr.slice(2, 4)
    const day = dateStr.slice(4, 6)
    const strike = parseInt(strikeStr) / 1000
    return {
      underlying,
      expiry: `${year}-${month}-${day}`,
      strike,
      type: type as "C" | "P",
    }
  }

  return null
}

/**
 * Parse the IBRIT Position file (version 1.994).
 *
 * Format:
 *   H,AccountID,Position,date,time,reportDate,version,...
 *   Type,AccountID,ConID,SecurityID,Symbol,...,AssetType,Currency,...,Quantity,...,CostPrice,CostBasis,...,MarketPrice,MarketValue,...,UnrealizedPL,...,Multiplier,...
 *   D,U1234567,11459264,US0162551016,ALGN,...,STK,USD,...,4.9954,...,524.47,2619.94,...,645.89,3226.48,...,606.54,...,1,...
 *   L,... (lot-level detail — skip)
 *   T,count,...  (trailer)
 */
function parseIBRITPositionFile(csv: string): NormalizedPosition[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 3) return []

  // Line 0 is H (header metadata), line 1 is column headers, rest is data
  const headerLine = lines[1]
  const headers = parseCSVLine(headerLine)
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => { idx[h.trim()] = i })

  const positions: NormalizedPosition[] = []

  for (let i = 2; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    const rowType = cols[0]?.trim()

    // Only process D (summary) rows, skip L (lot) and T (trailer)
    if (rowType !== "D") continue

    const get = (name: string) => {
      const j = idx[name]
      return j !== undefined ? cols[j]?.trim() ?? "" : ""
    }

    const assetTypeRaw = get("AssetType")
    const symbol = get("Symbol")
    const quantity = parseFloat(get("Quantity") || "0")
    const costPrice = parseFloat(get("CostPrice") || "0")
    const costBasis = parseFloat(get("CostBasis") || "0")
    const marketPrice = parseFloat(get("MarketPrice") || "0")
    const marketValue = parseFloat(get("MarketValue") || "0")
    const unrealizedPL = parseFloat(get("UnrealizedPL") || "0")
    const currency = get("Currency") || "USD"
    const multiplier = parseFloat(get("Multiplier") || "1")
    const conId = get("ConID")

    // Skip cash, dividend accruals, and zero-quantity rows
    if (!symbol || quantity === 0) continue
    const assetType = mapAssetType(assetTypeRaw)
    if (assetType === "cash") continue
    if (assetTypeRaw === "DIVACC" || assetTypeRaw === "INTACC") continue

    // Parse option details if applicable
    let optionUnderlying: string | undefined
    let optionExpiry: string | undefined
    let optionStrike: number | undefined
    let optionType: "C" | "P" | undefined
    let optionMultiplier: number | undefined

    if (assetType === "option") {
      const parsed = parseOptionSymbol(symbol)
      if (parsed) {
        optionUnderlying = parsed.underlying
        optionExpiry = parsed.expiry
        optionStrike = parsed.strike
        optionType = parsed.type
        optionMultiplier = multiplier || 100
      }
    }

    positions.push({
      symbol: symbol,
      quantity: Math.abs(quantity),
      averageCost: costPrice || (costBasis && quantity ? Math.abs(costBasis / quantity) : 0),
      currentPrice: marketPrice,
      marketValue: marketValue || (marketPrice * Math.abs(quantity) * (optionMultiplier ?? 1)),
      unrealizedPnl: unrealizedPL,
      assetType,
      currency,
      brokerRef: `ibrit-${conId || symbol.replace(/\s+/g, "-")}`,
      optionUnderlying,
      optionExpiry,
      optionStrike,
      optionType,
      optionMultiplier,
    })
  }

  return positions
}

/**
 * Parse IBKR Activity Statement CSV (downloaded manually from IBKR).
 * Multi-section format with "Open Positions" section containing Summary rows.
 */
export function parseActivityStatement(csv: string): NormalizedPosition[] {
  const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean)
  const positions: NormalizedPosition[] = []

  let headers: string[] = []
  let headerIndex: Record<string, number> = {}

  for (const line of lines) {
    const cols = parseCSVLine(line)
    if (cols.length < 3) continue

    const section = cols[0]?.trim()
    const discriminator = cols[1]?.trim()

    // Detect Open Positions header rows (there may be separate ones for Stocks and Options)
    if (section === "Open Positions" && discriminator === "Header") {
      headers = cols.slice(2).map((h) => h.trim())
      headerIndex = {}
      headers.forEach((h, i) => { headerIndex[h] = i })
      continue
    }

    // Process Open Positions data rows — Summary only
    if (section === "Open Positions" && discriminator === "Data") {
      const dataCols = cols.slice(2)
      const get = (name: string) => {
        const j = headerIndex[name]
        return j !== undefined ? dataCols[j]?.trim() ?? "" : ""
      }

      const dataDiscriminator = get("DataDiscriminator")
      if (dataDiscriminator !== "Summary") continue

      const assetCategory = get("Asset Category")
      const symbol = get("Symbol")
      const quantity = parseFloat(get("Quantity") || "0")
      const multiplier = parseFloat(get("Mult") || "1")
      const costPrice = parseFloat(get("Cost Price") || "0")
      const costBasis = parseFloat(get("Cost Basis") || "0")
      const closePrice = parseFloat(get("Close Price") || "0")
      const value = parseFloat(get("Value") || "0")
      const unrealizedPnl = parseFloat(get("Unrealized P/L") || "0")
      const currency = get("Currency") || "USD"

      if (!symbol || quantity === 0) continue

      const assetCat = assetCategory.toLowerCase()
      let assetType: NormalizedPosition["assetType"] = "stock"
      let optionUnderlying: string | undefined
      let optionExpiry: string | undefined
      let optionStrike: number | undefined
      let optionType: "C" | "P" | undefined
      let optionMultiplier: number | undefined

      if (assetCat.includes("option")) {
        assetType = "option"
        const parsed = parseOptionSymbol(symbol)
        if (parsed) {
          optionUnderlying = parsed.underlying
          optionExpiry = parsed.expiry
          optionStrike = parsed.strike
          optionType = parsed.type
          optionMultiplier = multiplier || 100
        }
      } else if (assetCat.includes("stock")) {
        assetType = "stock"
      } else if (assetCat.includes("bond")) {
        assetType = "bond"
      }

      positions.push({
        symbol: symbol.trim(),
        quantity: Math.abs(quantity),
        averageCost: costPrice || (costBasis && quantity ? Math.abs(costBasis / quantity) : 0),
        currentPrice: closePrice,
        marketValue: value,
        unrealizedPnl,
        assetType,
        currency,
        brokerRef: `ibrit-${symbol.trim().replace(/\s+/g, "-")}`,
        optionUnderlying,
        optionExpiry,
        optionStrike,
        optionType,
        optionMultiplier,
      })
    }
  }

  return positions
}

/**
 * Fetch positions via IBRIT web service.
 * Tries the most recent business days, falling back up to 5 days.
 */
export async function fetchIBRITPositions(
  credentials: IBRITCredentials
): Promise<NormalizedPosition[]> {
  for (let daysBack = 1; daysBack <= 5; daysBack++) {
    const date = new Date()
    date.setDate(date.getDate() - daysBack)
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "")

    try {
      const csv = await fetchReport(credentials, dateStr)
      return parseIBRITPositionFile(csv)
    } catch (err) {
      const msg = (err as Error).message
      // 1010 = no data for that date, try next
      if (msg.includes("No statement available")) continue
      throw err
    }
  }

  throw new Error("No IBKR position data available for the last 5 business days")
}

/**
 * Validate IBRIT credentials by attempting a fetch.
 */
export async function validateIBRITCredentials(
  credentials: IBRITCredentials
): Promise<boolean> {
  await fetchIBRITPositions(credentials)
  return true
}

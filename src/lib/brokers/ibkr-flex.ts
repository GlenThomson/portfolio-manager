/**
 * Interactive Brokers Flex Web Service client.
 *
 * The Flex Web Service is the user-self-serve way to pull IBKR account data:
 *   1. User logs into IBKR Account Management
 *   2. Reports → Flex Queries → creates a custom Activity Flex Query
 *      (must include OpenPositions section, optionally Trades + CashReport)
 *   3. Reports → Settings → Flex Web Service: enables the service and gets a Token
 *   4. The Query ID is shown on the Flex Queries list
 *   5. User pastes Token + Query ID into our connect dialog
 *
 * Protocol (two-step):
 *   A. POST .../FlexStatementService.SendRequest?t=<token>&q=<queryId>&v=3
 *      → returns XML with a ReferenceCode (queues statement generation)
 *   B. POST .../FlexStatementService.GetStatement?t=<token>&q=<referenceCode>&v=3
 *      → returns the actual statement XML. May return "still generating" — retry.
 */

// IBKR has multiple regional hosts. Some accounts (especially NZ/AU) need ndcdyn
// instead of the global gdcdyn. We try the explicit IBKR-documented endpoint first,
// then fall back to the alternate region if it fails with 1001.
const FLEX_HOSTS = [
  "https://ndcdyn.interactivebrokers.com",
  "https://gdcdyn.interactivebrokers.com",
]
const FLEX_PATH_SEND = "/AccountManagement/FlexWebService/SendRequest"
const FLEX_PATH_GET = "/AccountManagement/FlexWebService/GetStatement"

export interface FlexOpenPosition {
  accountId: string
  symbol: string
  description: string
  conid: string
  assetCategory: string  // STK, ETF, OPT, BOND, FUND, etc.
  currency: string
  position: number
  positionValue: number  // total market value in instrument currency
  markPrice: number
  costBasisPrice: number  // per-unit cost basis
  costBasisMoney: number  // total cost basis
}

export interface FlexFetchResult {
  positions: FlexOpenPosition[]
  accountIds: string[]
  fromDate: string | null
  toDate: string | null
  queryName: string | null
  rawXml: string  // useful for debugging
}

// ── XML helpers (simple regex — flex response shape is predictable) ─────

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : null
}

function extractAttr(xml: string, attr: string): string | null {
  const m = xml.match(new RegExp(`${attr}="([^"]*)"`))
  return m ? m[1] : null
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

// ── Step 1: request a statement ──────────────────────────────────────────

type RequestResult = {
  ok: true
  referenceCode: string
  url: string
} | {
  ok: false
  error: string
  code?: string
}

async function sendRequest(token: string, queryId: string): Promise<RequestResult> {
  // Try each regional host until one returns success or a non-transient error.
  let lastResult: RequestResult = { ok: false, error: "No host attempted" }

  for (const host of FLEX_HOSTS) {
    const url = `${host}${FLEX_PATH_SEND}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PortfolioAI/1.0" },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) {
        lastResult = { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
        continue
      }
      const xml = await res.text()
      const status = extractTag(xml, "Status")
      if (status === "Success") {
        const referenceCode = extractTag(xml, "ReferenceCode")
        const responseUrl = extractTag(xml, "Url")
        if (!referenceCode || !responseUrl) {
          lastResult = { ok: false, error: "Missing ReferenceCode or Url in response" }
          continue
        }
        return { ok: true, referenceCode, url: responseUrl }
      }
      const errorCode = extractTag(xml, "ErrorCode") ?? undefined
      const errorMessage = extractTag(xml, "ErrorMessage") ?? "Unknown error"
      lastResult = { ok: false, code: errorCode, error: errorMessage }
      // If we hit a clear "wrong token" / "wrong query" error, no point trying other hosts
      if (errorCode && ["1002", "1003", "1004", "1005"].includes(errorCode)) {
        return lastResult
      }
    } catch (err) {
      lastResult = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  return lastResult
}

// ── Step 2: poll for the actual statement ────────────────────────────────

type StatementResult = {
  ok: true
  xml: string
} | {
  ok: false
  error: string
  code?: string
}

async function getStatement(url: string, token: string, referenceCode: string): Promise<StatementResult> {
  const fullUrl = `${url}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(referenceCode)}&v=3`
  const res = await fetch(fullUrl, {
    headers: { "User-Agent": "PortfolioAI/1.0" },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
  const text = await res.text()

  // Flex returns either a <FlexStatementResponse> with error/status, or the
  // <FlexQueryResponse> root of the actual data.
  if (text.includes("<FlexStatementResponse")) {
    const status = extractTag(text, "Status")
    if (status === "Warn") {
      // Still generating; caller can retry
      const code = extractTag(text, "ErrorCode") ?? undefined
      const message = extractTag(text, "ErrorMessage") ?? "Statement generation in progress"
      return { ok: false, code, error: message }
    }
    const errorCode = extractTag(text, "ErrorCode") ?? undefined
    const errorMessage = extractTag(text, "ErrorMessage") ?? "Unknown error fetching statement"
    return { ok: false, code: errorCode, error: errorMessage }
  }

  if (text.includes("<FlexQueryResponse")) {
    return { ok: true, xml: text }
  }

  return { ok: false, error: "Unexpected response format from Flex GetStatement" }
}

// ── Parser: extract OpenPositions from FlexQueryResponse ──────────────────

function parsePositions(xml: string): FlexOpenPosition[] {
  const out: FlexOpenPosition[] = []

  // <OpenPosition ... /> entries (self-closing, attributes only)
  const openPositionMatches = xml.matchAll(/<OpenPosition\b([^>]*?)\/?>/g)
  for (const match of openPositionMatches) {
    const attrs = match[1]
    const positionStr = extractAttr(attrs, "position")
    if (!positionStr) continue
    const positionQty = parseFloat(positionStr)
    if (!Number.isFinite(positionQty) || positionQty === 0) continue

    const positionValue = parseFloat(extractAttr(attrs, "positionValue") ?? "0")
    const explicitMarkPrice = parseFloat(extractAttr(attrs, "markPrice") ?? "0")
    // Derive markPrice from positionValue/quantity if it wasn't returned explicitly
    const markPrice = explicitMarkPrice > 0
      ? explicitMarkPrice
      : positionQty !== 0 ? positionValue / positionQty : 0

    const costBasisMoney = parseFloat(extractAttr(attrs, "costBasisMoney") ?? "0")
    const explicitCostBasisPrice = parseFloat(extractAttr(attrs, "costBasisPrice") ?? "0")
    const costBasisPrice = explicitCostBasisPrice > 0
      ? explicitCostBasisPrice
      : (costBasisMoney !== 0 && positionQty !== 0 ? Math.abs(costBasisMoney) / Math.abs(positionQty) : 0)

    out.push({
      accountId: decodeXmlEntities(extractAttr(attrs, "accountId") ?? ""),
      symbol: decodeXmlEntities(extractAttr(attrs, "symbol") ?? ""),
      description: decodeXmlEntities(extractAttr(attrs, "description") ?? ""),
      conid: extractAttr(attrs, "conid") ?? "",
      assetCategory: extractAttr(attrs, "assetCategory") ?? "STK",
      currency: extractAttr(attrs, "currency") ?? "USD",
      position: positionQty,
      positionValue,
      markPrice,
      costBasisPrice,
      costBasisMoney,
    })
  }

  return out
}

// ── Public entry point: end-to-end fetch with retry on "still generating" ─

// Transient error codes IBKR returns when the statement isn't ready yet.
// 1018 = too many requests; 1019 = still generating; 1001 = couldn't generate, try again.
const RETRYABLE_CODES = new Set(["1001", "1018", "1019"])

export async function fetchFlexPositions(
  token: string,
  queryId: string,
  opts: { maxRetries?: number; retryDelayMs?: number } = {},
): Promise<FlexFetchResult> {
  const maxRetries = opts.maxRetries ?? 6
  const retryDelayMs = opts.retryDelayMs ?? 4000

  // Step 1 — request the statement be generated. Code 1001 can also fire here,
  // so we retry the SendRequest call too.
  let req: Awaited<ReturnType<typeof sendRequest>> | null = null
  let sendErr = "Unknown error"
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs))
    req = await sendRequest(token, queryId)
    if (req.ok) break
    sendErr = req.error
    if (!req.code || !RETRYABLE_CODES.has(req.code)) {
      throw new Error(`Flex request failed (${req.code ?? "?"}): ${req.error}`)
    }
  }
  if (!req || !req.ok) {
    throw new Error(`Flex request failed after ${maxRetries + 1} attempts: ${sendErr}`)
  }

  // Step 2 — poll for the actual statement
  let lastError = "Unknown error"
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs))

    const stmt = await getStatement(req.url, token, req.referenceCode)
    if (stmt.ok) {
      const positions = parsePositions(stmt.xml)
      const accountIds = Array.from(new Set(positions.map((p) => p.accountId).filter(Boolean)))
      return {
        positions,
        accountIds,
        fromDate: extractAttr(stmt.xml, "fromDate"),
        toDate: extractAttr(stmt.xml, "toDate"),
        queryName: extractAttr(stmt.xml, "queryName"),
        rawXml: stmt.xml,
      }
    }
    lastError = stmt.error
    if (!stmt.code || !RETRYABLE_CODES.has(stmt.code)) {
      throw new Error(`Flex GetStatement failed (${stmt.code}): ${stmt.error}`)
    }
  }

  throw new Error(`Flex statement not ready after ${maxRetries + 1} attempts: ${lastError}`)
}

// ── Normalize for our DB shape ──────────────────────────────────────────

export interface NormalizedFlexPosition {
  symbol: string
  quantity: number
  averageCost: number
  assetType: "stock" | "etf" | "crypto" | "option" | "bond" | "other"
  currency: string
  brokerRef: string  // conid-based unique ref
}

function mapAssetType(cat: string): NormalizedFlexPosition["assetType"] {
  const map: Record<string, NormalizedFlexPosition["assetType"]> = {
    STK: "stock",
    ETF: "etf",
    OPT: "option",
    BOND: "bond",
    CRYPTO: "crypto",
  }
  return map[cat] ?? "other"
}

export function normalizePositions(positions: FlexOpenPosition[]): NormalizedFlexPosition[] {
  return positions.map((p) => {
    // Prefer cost basis; fall back to current market price (positionValue / qty) so
    // the position has SOME value to display when the query is minimal.
    const fallbackPrice = p.position !== 0 ? Math.abs(p.positionValue) / Math.abs(p.position) : 0
    const avgCost = p.costBasisPrice > 0
      ? p.costBasisPrice
      : (p.costBasisMoney !== 0 ? Math.abs(p.costBasisMoney) / Math.abs(p.position || 1) : (p.markPrice > 0 ? p.markPrice : fallbackPrice))

    return {
      symbol: p.symbol,
      quantity: Math.abs(p.position),
      averageCost: avgCost,
      assetType: mapAssetType(p.assetCategory),
      currency: p.currency,
      // Conid is the ideal unique key — but if the query doesn't include it, fall back to symbol.
      brokerRef: `ibkr-${p.accountId}-${p.conid || p.symbol}`,
    }
  })
}

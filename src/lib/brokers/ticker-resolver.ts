/**
 * Resolves display names (e.g. "ASML Holding") to ticker symbols (e.g. "ASML")
 * using multiple strategies with verification to prevent wrong matches.
 */

import { searchSymbols } from "@/lib/market/yahoo"

// Static map for NZ/AU stocks and ETFs that Yahoo search handles poorly
const KNOWN_MAPPINGS: Record<string, string> = {
  // NZ stocks
  "fisher & paykel healthcare": "FPH.NZ",
  "a2 milk company": "ATM.NZ",
  "air new zealand": "AIR.NZ",
  "auckland international airport": "AIA.NZ",
  "contact energy": "CEN.NZ",
  "ebos group": "EBO.NZ",
  "fletcher building": "FBU.NZ",
  "freightways": "FRE.NZ",
  "genesis energy": "GNE.NZ",
  "infratil": "IFT.NZ",
  "mainfreight": "MFT.NZ",
  "mercury nz": "MCY.NZ",
  "meridian energy": "MEL.NZ",
  "ryman healthcare": "RYM.NZ",
  "spark new zealand": "SPK.NZ",
  "summerset group": "SUM.NZ",
  "the warehouse group": "WHS.NZ",
  "xero": "XRO.AX",
  "pushpay": "PPH.NZ",
  "serko": "SKO.NZ",
  "vista group": "VGL.NZ",
  "skellerup": "SKL.NZ",
  "chorus": "CNU.NZ",
  "kiwi property group": "KPG.NZ",
  "port of tauranga": "POT.NZ",
  "property for industry": "PFI.NZ",
  "turners automotive group": "TRA.NZ",
  "my food bag": "MFB.NZ",
  "rocket lab": "RKLB",
  // AU stocks
  "csl limited": "CSL.AX",
  "bhp group": "BHP.AX",
  "commonwealth bank": "CBA.AX",
  "westpac banking": "WBC.AX",
  "anz group": "ANZ.AX",
  "national australia bank": "NAB.AX",
  "telstra": "TLS.AX",
  "woolworths group": "WOW.AX",
  "wesfarmers": "WES.AX",
  "macquarie group": "MQG.AX",
  // Smartshares / NZ ETFs
  "smartshares us 500": "USF.NZ",
  "smartshares nz top 50": "FNZ.NZ",
  "smartshares total world": "TWF.NZ",
  "smartshares us large growth": "USG.NZ",
  "smartshares us mid cap": "USM.NZ",
  "smartshares australia 20": "OZY.NZ",
  "smartshares global aggregate bond": "AGG.NZ",
  "smartshares nz property": "NPF.NZ",
  "smartshares nz dividend": "DIV.NZ",
  "smartshares emerging markets": "EMF.NZ",
}

export interface ResolvedTicker {
  originalName: string
  symbol: string | null
  confidence: "high" | "medium" | "low" | "unresolved"
  source: "static" | "search" | "extracted" | "none"
}

/**
 * Normalize a string for comparison — lowercase, strip suffixes like
 * "inc", "ltd", "nv", "plc", "corp", "holding(s)", "group", "company"
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\-()]/g, " ")
    .replace(
      /\b(inc|ltd|limited|nv|plc|corp|corporation|holdings?|group|co|company|se|ag|sa)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Check if two company names are a good match.
 * Returns true if the core words overlap significantly.
 */
function namesMatch(name1: string, name2: string): boolean {
  const a = normalizeCompanyName(name1)
  const b = normalizeCompanyName(name2)

  // Exact match after normalization
  if (a === b) return true

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true

  // Check word overlap — at least the first significant word must match
  const wordsA = a.split(" ").filter((w) => w.length > 1)
  const wordsB = b.split(" ").filter((w) => w.length > 1)

  if (wordsA.length === 0 || wordsB.length === 0) return false

  // First word must match (company's primary name)
  if (wordsA[0] !== wordsB[0]) return false

  // At least 50% of the shorter name's words must appear in the longer
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB
  const longer = new Set(wordsA.length > wordsB.length ? wordsA : wordsB)
  const overlap = shorter.filter((w) => longer.has(w)).length
  return overlap / shorter.length >= 0.5
}

/**
 * Try to extract a ticker symbol directly from the holding name or metadata.
 * Sharesies often formats names like "Apple (AAPL)" or "ASML Holding NV"
 * where the ticker is a recognizable pattern.
 */
function extractTickerFromName(name: string): string | null {
  // Check for ticker in parentheses: "Apple Inc (AAPL)"
  const parenMatch = name.match(/\(([A-Z]{1,5})\)/)
  if (parenMatch) return parenMatch[1]

  // Check for ticker after a dash: "AAPL - Apple Inc"
  const dashMatch = name.match(/^([A-Z]{1,5})\s*[-–—]\s/)
  if (dashMatch) return dashMatch[1]

  return null
}

/**
 * Resolve a single display name to a ticker symbol.
 * Uses multiple strategies with verification.
 */
export async function resolveTicker(
  name: string,
  extraFields?: { ticker?: string; code?: string; symbol?: string }
): Promise<ResolvedTicker> {
  // 0. If Akahu provides a ticker/symbol/code field directly, use it
  const directTicker = extraFields?.ticker ?? extraFields?.symbol ?? extraFields?.code
  if (directTicker && /^[A-Z0-9.\-]{1,20}$/i.test(directTicker)) {
    return {
      originalName: name,
      symbol: directTicker.toUpperCase(),
      confidence: "high",
      source: "extracted",
    }
  }

  // 1. Try to extract ticker from the name itself
  const extracted = extractTickerFromName(name)
  if (extracted) {
    return {
      originalName: name,
      symbol: extracted,
      confidence: "high",
      source: "extracted",
    }
  }

  const normalised = name.toLowerCase().trim()

  // 2. Check static map
  for (const [key, symbol] of Object.entries(KNOWN_MAPPINGS)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return { originalName: name, symbol, confidence: "high", source: "static" }
    }
  }

  // 3. Yahoo Finance search WITH name verification
  try {
    const results = await searchSymbols(name)
    if (results.length > 0) {
      // Find the best match where the company name actually matches
      for (const result of results) {
        if (result.type !== "EQUITY" && result.type !== "ETF") continue
        if (namesMatch(name, result.shortName)) {
          return {
            originalName: name,
            symbol: result.symbol,
            confidence: "high",
            source: "search",
          }
        }
      }

      // Fallback: check if the search query words appear in the symbol itself
      // e.g. "ASML Holding" → symbol "ASML" (first word matches symbol)
      const firstWord = name.split(/\s+/)[0].toUpperCase()
      for (const result of results) {
        if (result.type !== "EQUITY" && result.type !== "ETF") continue
        // Symbol matches the first word of the name exactly
        if (result.symbol === firstWord || result.symbol.startsWith(firstWord + ".")) {
          return {
            originalName: name,
            symbol: result.symbol,
            confidence: "medium",
            source: "search",
          }
        }
      }

      // Last resort: only accept if the first result's shortName has significant overlap
      const best = results.find(
        (r: { type: string }) => r.type === "EQUITY" || r.type === "ETF"
      )
      if (best && namesMatch(name, best.shortName)) {
        return {
          originalName: name,
          symbol: best.symbol,
          confidence: "medium",
          source: "search",
        }
      }
    }
  } catch {
    // Search failed — fall through to unresolved
  }

  return { originalName: name, symbol: null, confidence: "unresolved", source: "none" }
}

/**
 * Batch resolve multiple display names to ticker symbols.
 */
export async function resolveTickersBatch(
  holdings: Array<{ name: string; ticker?: string; code?: string; symbol?: string }>
): Promise<Map<string, ResolvedTicker>> {
  const seen = new Set<string>()
  const results = new Map<string, ResolvedTicker>()

  for (const holding of holdings) {
    const name = holding.name.trim()
    if (seen.has(name)) continue
    seen.add(name)

    const resolved = await resolveTicker(name, holding)
    results.set(name, resolved)
    // Small delay between Yahoo searches to avoid rate limiting
    if (resolved.source === "search") {
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  return results
}

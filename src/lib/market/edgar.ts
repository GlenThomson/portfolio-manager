const SEC_USER_AGENT = "PortfolioAI contact@example.com"

const COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions"
const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"

export interface Filing {
  type: string
  date: string
  accessionNumber: string
  primaryDocument: string
  description: string
  cik: string // Company CIK (unpadded) for constructing correct SEC URLs
}

// In-memory CIK cache: ticker -> CIK number (zero-padded to 10 digits)
const cikCache = new Map<string, string>()

// Full ticker map cache (loaded once)
let tickerMapPromise: Promise<Record<string, { cik_str: number; ticker: string }>> | null = null

async function fetchSecJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate: 300 }, // Cache for 5 minutes in Next.js
  })
  if (!res.ok) {
    throw new Error(`SEC request failed: ${res.status} ${res.statusText} for ${url}`)
  }
  return res.json() as Promise<T>
}

async function fetchSecText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "text/html, text/plain, application/xhtml+xml",
    },
  })
  if (!res.ok) {
    throw new Error(`SEC request failed: ${res.status} ${res.statusText} for ${url}`)
  }
  return res.text()
}

function loadTickerMap(): Promise<Record<string, { cik_str: number; ticker: string }>> {
  if (!tickerMapPromise) {
    tickerMapPromise = fetchSecJson<Record<string, { cik_str: number; ticker: string }>>(
      COMPANY_TICKERS_URL
    ).catch((err) => {
      tickerMapPromise = null // Allow retry on failure
      throw err
    })
  }
  return tickerMapPromise
}

/**
 * Map a stock ticker to a SEC CIK number (zero-padded to 10 digits).
 */
export async function getCIK(ticker: string): Promise<string> {
  const upper = ticker.toUpperCase()

  if (cikCache.has(upper)) {
    return cikCache.get(upper)!
  }

  const tickerMap = await loadTickerMap()

  // The JSON is keyed by index, each value has { cik_str, ticker, title }
  for (const entry of Object.values(tickerMap)) {
    if (entry.ticker === upper) {
      const padded = String(entry.cik_str).padStart(10, "0")
      cikCache.set(upper, padded)
      return padded
    }
  }

  throw new Error(`CIK not found for ticker: ${upper}`)
}

/**
 * Fetch recent SEC filings for a company.
 */
export async function getFilings(
  ticker: string,
  filingType?: string,
  count: number = 20
): Promise<Filing[]> {
  const cik = await getCIK(ticker)
  // Unpadded CIK for SEC archive URLs
  const cikNum = String(parseInt(cik, 10))
  const url = `${SUBMISSIONS_BASE}/CIK${cik}.json`

  const data = await fetchSecJson<{
    cik: string
    filings: {
      recent: {
        form: string[]
        filingDate: string[]
        accessionNumber: string[]
        primaryDocument: string[]
        primaryDocDescription: string[]
      }
    }
  }>(url)

  const recent = data.filings.recent
  const filings: Filing[] = []

  for (let i = 0; i < recent.form.length && filings.length < count; i++) {
    const form = recent.form[i]

    // Filter by filing type if specified
    if (filingType && form !== filingType) continue

    // Only include common filing types if no filter specified
    if (!filingType && !["10-K", "10-Q", "8-K", "10-K/A", "10-Q/A", "8-K/A", "20-F", "6-K", "S-1", "DEF 14A"].includes(form)) {
      continue
    }

    filings.push({
      type: form,
      date: recent.filingDate[i],
      accessionNumber: recent.accessionNumber[i],
      primaryDocument: recent.primaryDocument[i],
      description: recent.primaryDocDescription[i] || form,
      cik: cikNum,
    })
  }

  return filings
}

/**
 * Fetch the text content of a specific filing document.
 */
export async function getFilingDocument(
  accessionNumber: string,
  primaryDocument: string,
  cikOrTicker?: string
): Promise<string> {
  // Accession number format: "0001234567-24-012345" -> need to remove dashes for URL path
  const accessionClean = accessionNumber.replace(/-/g, "")

  // We need the CIK for the URL path. Try to extract from accession or use provided ticker.
  let cikNum: string
  if (cikOrTicker) {
    // If it looks like a ticker (alphabetic), look up CIK
    if (/^[A-Za-z]/.test(cikOrTicker)) {
      const padded = await getCIK(cikOrTicker)
      cikNum = String(parseInt(padded, 10)) // Remove leading zeros for URL
    } else {
      cikNum = cikOrTicker
    }
  } else {
    // Extract CIK from the first part of the accession number
    // Accession format: {CIK}-{YY}-{SEQ}
    cikNum = accessionNumber.split("-")[0].replace(/^0+/, "")
  }

  const url = `${ARCHIVES_BASE}/${cikNum}/${accessionClean}/${primaryDocument}`
  const text = await fetchSecText(url)

  // Strip HTML tags for a cleaner text representation
  const cleaned = text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned
}

/**
 * Standard 10-K / 10-Q section patterns.
 * We match "Item 1A" style headings in the cleaned text.
 */
const SECTION_MAP: Record<string, { label: string; patterns: RegExp[] }> = {
  business: {
    label: "Item 1 — Business",
    patterns: [/\bItem\s+1[.\s]*[-–—]?\s*Business\b/i],
  },
  risk_factors: {
    label: "Item 1A — Risk Factors",
    patterns: [/\bItem\s+1A[.\s]*[-–—]?\s*Risk\s+Factors\b/i],
  },
  mda: {
    label: "Item 7 — Management's Discussion and Analysis",
    patterns: [
      /\bItem\s+7[.\s]*[-–—]?\s*Management'?s?\s+Discussion/i,
    ],
  },
  market_risk: {
    label: "Item 7A — Quantitative and Qualitative Disclosures About Market Risk",
    patterns: [/\bItem\s+7A[.\s]*[-–—]?\s*Quantitative/i],
  },
  financials: {
    label: "Item 8 — Financial Statements",
    patterns: [/\bItem\s+8[.\s]*[-–—]?\s*Financial\s+Statements/i],
  },
  controls: {
    label: "Item 9A — Controls and Procedures",
    patterns: [/\bItem\s+9A[.\s]*[-–—]?\s*Controls/i],
  },
}

// Ordered list of all Item headings for finding section boundaries
const ALL_ITEM_PATTERNS = [
  /\bItem\s+1[.\s]*[-–—]?\s*Business\b/i,
  /\bItem\s+1A[.\s]*[-–—]?\s*Risk\s+Factors\b/i,
  /\bItem\s+1B/i,
  /\bItem\s+1C/i,
  /\bItem\s+2[.\s]*[-–—]?\s*Properties\b/i,
  /\bItem\s+3[.\s]*[-–—]?\s*Legal/i,
  /\bItem\s+4/i,
  /\bItem\s+5/i,
  /\bItem\s+6/i,
  /\bItem\s+7[.\s]*[-–—]?\s*Management/i,
  /\bItem\s+7A/i,
  /\bItem\s+8[.\s]*[-–—]?\s*Financial/i,
  /\bItem\s+9[.\s]*[-–—]?\s*Changes/i,
  /\bItem\s+9A/i,
  /\bItem\s+9B/i,
  /\bItem\s+10/i,
  /\bItem\s+11/i,
  /\bItem\s+12/i,
  /\bItem\s+13/i,
  /\bItem\s+14/i,
  /\bItem\s+15/i,
  /\bItem\s+16/i,
]

/**
 * Extract a specific section from a filing's cleaned text.
 * Finds the section start, then looks for the next Item heading as the boundary.
 */
export function extractSection(
  text: string,
  sectionKey: string
): { section: string; label: string; charCount: number } | null {
  const sectionDef = SECTION_MAP[sectionKey]
  if (!sectionDef) return null

  // Find where this section starts
  let startIdx = -1
  for (const pattern of sectionDef.patterns) {
    const match = text.match(pattern)
    if (match && match.index !== undefined) {
      startIdx = match.index
      break
    }
  }

  if (startIdx === -1) return null

  // Find the next Item heading after this one to determine the end boundary
  let endIdx = text.length
  for (const pattern of ALL_ITEM_PATTERNS) {
    // Search for matches AFTER our start position
    const searchText = text.slice(startIdx + 20) // skip past our own heading
    const match = searchText.match(pattern)
    if (match && match.index !== undefined) {
      const candidateEnd = startIdx + 20 + match.index
      if (candidateEnd < endIdx) {
        endIdx = candidateEnd
      }
    }
  }

  const section = text.slice(startIdx, endIdx).trim()

  return {
    section: section.length > 50000 ? section.slice(0, 50000) + "\n\n[Section truncated at 50,000 characters]" : section,
    label: sectionDef.label,
    charCount: section.length,
  }
}

/**
 * List available sections found in a filing's text.
 */
export function listSections(text: string): string[] {
  const found: string[] = []
  for (const [key, def] of Object.entries(SECTION_MAP)) {
    for (const pattern of def.patterns) {
      if (pattern.test(text)) {
        found.push(key)
        break
      }
    }
  }
  return found
}

/**
 * Get the SEC EDGAR URL for a filing.
 * @param cik - The company CIK number (not the filing agent CIK from accession number)
 */
export function getFilingUrl(accessionNumber: string, primaryDocument: string, cik?: string): string {
  const accessionClean = accessionNumber.replace(/-/g, "")
  // Use provided company CIK; fall back to accession prefix (less reliable)
  const cikNum = cik ?? accessionNumber.split("-")[0].replace(/^0+/, "")
  return `${ARCHIVES_BASE}/${cikNum}/${accessionClean}/${primaryDocument}`
}

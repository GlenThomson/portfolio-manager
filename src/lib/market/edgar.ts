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
 * Get the SEC EDGAR URL for a filing.
 * @param cik - The company CIK number (not the filing agent CIK from accession number)
 */
export function getFilingUrl(accessionNumber: string, primaryDocument: string, cik?: string): string {
  const accessionClean = accessionNumber.replace(/-/g, "")
  // Use provided company CIK; fall back to accession prefix (less reliable)
  const cikNum = cik ?? accessionNumber.split("-")[0].replace(/^0+/, "")
  return `${ARCHIVES_BASE}/${cikNum}/${accessionClean}/${primaryDocument}`
}

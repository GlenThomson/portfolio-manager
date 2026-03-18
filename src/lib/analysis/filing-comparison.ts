/**
 * LLM-powered filing comparison.
 *
 * Split into two phases for user-visible progress:
 *   1. getFilingPair() — fast, just fetches the filing index from SEC
 *   2. fetchAndExtractSections() — downloads ONE filing + extracts sections
 *
 * The AI orchestrates these in sequence, narrating progress between calls.
 *
 * Based on MarketSenseAI approach — LLM analysis of filings achieves
 * Sharpe 1.5 on S&P 500 per academic research.
 */

import { getFilings, getFilingDocument } from "@/lib/market/edgar"

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────

export interface FilingSection {
  name: string
  content: string
  wordCount: number
}

export interface FilingExtract {
  type: string
  date: string
  accessionNumber: string
  sections: FilingSection[]
  totalWordCount: number
}

export interface FilingPair {
  symbol: string
  filingType: string
  current: { date: string; accessionNumber: string; primaryDocument: string }
  prior: { date: string; accessionNumber: string; primaryDocument: string }
}

// ──────────────────────────────────────────────────────
// Section extraction
// ──────────────────────────────────────────────────────

const EXCERPT_LENGTH = 4000

/**
 * Extract key sections from a 10-K filing text.
 */
function extractAnnualSections(text: string): FilingSection[] {
  return extractWithPatterns(text, [
    {
      name: "Risk Factors (Item 1A)",
      startPatterns: [
        /ITEM\s+1A[\s.:\-–—]+RISK\s+FACTORS/,
        /item\s+1a[\s.:\-–—]+risk\s+factors/i,
        /item\s+1a\b/i,
      ],
      endPatterns: [
        /ITEM\s+1B[\s.:\-–—]/,
        /item\s+1b[\s.:\-–—]/i,
        /ITEM\s+2[\s.:\-–—]/,
        /item\s+2[\s.:\-–—]/i,
        /unresolved\s+staff\s+comments/i,
      ],
    },
    {
      name: "MD&A (Item 7)",
      startPatterns: [
        /ITEM\s+7[\s.:\-–—]+MANAGEMENT.?S\s+DISCUSSION/,
        /item\s+7[\s.:\-–—]+management.?s\s+discussion/i,
        /item\s+7[\s.:\-–—]/i,
        /management.?s\s+discussion\s+and\s+analysis/i,
      ],
      endPatterns: [
        /ITEM\s+7A[\s.:\-–—]/,
        /item\s+7a[\s.:\-–—]/i,
        /ITEM\s+8[\s.:\-–—]/,
        /item\s+8[\s.:\-–—]/i,
        /quantitative\s+and\s+qualitative\s+disclosures/i,
      ],
    },
    {
      name: "Business (Item 1)",
      startPatterns: [
        /ITEM\s+1[\s.:\-–—]+BUSINESS\b/,
        /item\s+1[\s.:\-–—]+business\b/i,
        /item\s+1[\s.:\-–—](?![\da])/i,
      ],
      endPatterns: [
        /ITEM\s+1A[\s.:\-–—]/,
        /item\s+1a[\s.:\-–—]/i,
        /item\s+1b[\s.:\-–—]/i,
        /risk\s+factors/i,
      ],
    },
  ])
}

/**
 * Extract sections from a 10-Q filing.
 */
function extractQuarterlySections(text: string): FilingSection[] {
  return extractWithPatterns(text, [
    {
      name: "Risk Factors",
      startPatterns: [
        /PART\s+II.*ITEM\s+1A[\s.:\-–—]+RISK\s+FACTORS/,
        /ITEM\s+1A[\s.:\-–—]+RISK\s+FACTORS/,
        /part\s+ii.*item\s+1a[\s.:\-–—]+risk\s+factors/i,
        /item\s+1a[\s.:\-–—]+risk\s+factors/i,
      ],
      endPatterns: [
        /ITEM\s+2[\s.:\-–—]/,
        /item\s+2[\s.:\-–—]/i,
        /item\s+1b[\s.:\-–—]/i,
        /unregistered\s+sales/i,
      ],
    },
    {
      name: "MD&A",
      startPatterns: [
        /ITEM\s+2[\s.:\-–—]+MANAGEMENT.?S\s+DISCUSSION/,
        /item\s+2[\s.:\-–—]+management.?s\s+discussion/i,
        /management.?s\s+discussion\s+and\s+analysis/i,
      ],
      endPatterns: [
        /ITEM\s+3[\s.:\-–—]/,
        /item\s+3[\s.:\-–—]/i,
        /quantitative\s+and\s+qualitative/i,
      ],
    },
  ])
}

function extractWithPatterns(
  text: string,
  patterns: { name: string; startPatterns: RegExp[]; endPatterns: RegExp[] }[]
): FilingSection[] {
  const sections: FilingSection[] = []

  for (const pattern of patterns) {
    let startIdx = -1

    for (const re of pattern.startPatterns) {
      const match = text.match(re)
      if (match && match.index != null) {
        startIdx = match.index
        break
      }
    }

    if (startIdx === -1) continue

    let endIdx = text.length
    const searchFrom = startIdx + 50

    for (const re of pattern.endPatterns) {
      const remaining = text.slice(searchFrom)
      const match = remaining.match(re)
      if (match && match.index != null) {
        const candidateEnd = searchFrom + match.index
        if (candidateEnd < endIdx) {
          endIdx = candidateEnd
        }
      }
    }

    const content = text.slice(startIdx, endIdx).trim()
    const wordCount = content.split(/\s+/).length

    if (wordCount > 100) {
      sections.push({
        name: pattern.name,
        content: content.slice(0, EXCERPT_LENGTH),
        wordCount,
      })
    }
  }

  return sections
}

// ──────────────────────────────────────────────────────
// Phase 1: Get filing pair (fast — just reads the index)
// ──────────────────────────────────────────────────────

/**
 * Fetch the two most recent filings of a given type.
 * This is fast — only reads the SEC submissions index, not the filing content.
 */
export async function getFilingPair(
  symbol: string,
  filingType: "10-K" | "10-Q" = "10-K"
): Promise<FilingPair> {
  const upperSymbol = symbol.toUpperCase()
  const filings = await getFilings(upperSymbol, filingType, 5)

  if (filings.length < 2) {
    throw new Error(
      `Need at least 2 ${filingType} filings for comparison. Found ${filings.length} for ${upperSymbol}.`
    )
  }

  return {
    symbol: upperSymbol,
    filingType,
    current: {
      date: filings[0].date,
      accessionNumber: filings[0].accessionNumber,
      primaryDocument: filings[0].primaryDocument,
    },
    prior: {
      date: filings[1].date,
      accessionNumber: filings[1].accessionNumber,
      primaryDocument: filings[1].primaryDocument,
    },
  }
}

// ──────────────────────────────────────────────────────
// Phase 2: Download and extract one filing (slow — downloads full doc)
// ──────────────────────────────────────────────────────

/**
 * Download a single filing and extract key sections.
 * This is the slow step — downloads 100K+ chars from SEC EDGAR.
 */
export async function fetchAndExtractSections(
  symbol: string,
  accessionNumber: string,
  primaryDocument: string,
  filingType: "10-K" | "10-Q",
  filingDate: string
): Promise<FilingExtract> {
  const text = await getFilingDocument(accessionNumber, primaryDocument, symbol)

  const extractFn = filingType === "10-K" ? extractAnnualSections : extractQuarterlySections
  const sections = extractFn(text)

  return {
    type: filingType,
    date: filingDate,
    accessionNumber,
    sections,
    totalWordCount: sections.reduce((s, sec) => s + sec.wordCount, 0),
  }
}

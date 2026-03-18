/**
 * LLM-powered filing comparison.
 *
 * Fetches the two most recent 10-K (or 10-Q) filings for a company,
 * extracts Risk Factors and MD&A sections, and returns structured
 * comparison data for the AI to analyze trajectory changes.
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
  type: string // "10-K" or "10-Q"
  date: string
  accessionNumber: string
  sections: FilingSection[]
  totalWordCount: number
}

export interface FilingComparisonResult {
  symbol: string
  filingType: string
  current: FilingExtract
  prior: FilingExtract
  sectionComparisons: SectionComparison[]
  instruction: string
}

export interface SectionComparison {
  section: string
  currentWordCount: number
  priorWordCount: number
  wordCountChange: number // positive = grew
  currentExcerpt: string // first ~3000 chars
  priorExcerpt: string
}

// ──────────────────────────────────────────────────────
// Section extraction
// ──────────────────────────────────────────────────────

/**
 * Extract key sections from a 10-K filing text.
 * Looks for Item 1A (Risk Factors), Item 7 (MD&A), and Item 1 (Business).
 */
function extractSections(text: string): FilingSection[] {
  const sections: FilingSection[] = []

  // Patterns to find section headers in SEC filings
  // These are flexible to handle various formatting styles
  const sectionPatterns: { name: string; startPatterns: RegExp[]; endPatterns: RegExp[] }[] = [
    {
      name: "Risk Factors (Item 1A)",
      startPatterns: [
        // All-caps first (actual section header, skips TOC which uses mixed case)
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
        // All-caps first; .? handles stripped curly apostrophe (&#8217; → empty)
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
  ]

  for (const pattern of sectionPatterns) {
    let startIdx = -1

    // Find section start — prefer all-caps match (actual section body, not TOC)
    for (const re of pattern.startPatterns) {
      const match = text.match(re)
      if (match && match.index != null) {
        startIdx = match.index
        break
      }
    }

    if (startIdx === -1) continue

    // Find section end
    let endIdx = text.length
    const searchFrom = startIdx + 50 // skip past the header itself

    for (const re of pattern.endPatterns) {
      // Search from after the start header
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

    // Only include if the section has meaningful content
    if (wordCount > 100) {
      sections.push({
        name: pattern.name,
        content,
        wordCount,
      })
    }
  }

  return sections
}

/**
 * Extract sections from a 10-Q filing (different structure than 10-K).
 */
function extractQuarterlySections(text: string): FilingSection[] {
  const sections: FilingSection[] = []

  const sectionPatterns: { name: string; startPatterns: RegExp[]; endPatterns: RegExp[] }[] = [
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
  ]

  for (const pattern of sectionPatterns) {
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
        content,
        wordCount,
      })
    }
  }

  return sections
}

// ──────────────────────────────────────────────────────
// Main comparison function
// ──────────────────────────────────────────────────────

const EXCERPT_LENGTH = 4000 // chars per section excerpt sent to AI

/**
 * Fetch and compare two consecutive filings (10-K or 10-Q) for a company.
 * Returns extracted sections and structured comparison for AI analysis.
 */
export async function compareFilings(
  symbol: string,
  filingType: "10-K" | "10-Q" = "10-K"
): Promise<FilingComparisonResult> {
  const upperSymbol = symbol.toUpperCase()

  // Fetch recent filings of the specified type
  const filings = await getFilings(upperSymbol, filingType, 5)

  if (filings.length < 2) {
    throw new Error(
      `Need at least 2 ${filingType} filings for comparison. Found ${filings.length} for ${upperSymbol}.`
    )
  }

  const currentFiling = filings[0]
  const priorFiling = filings[1]

  // Fetch both filing documents in parallel
  const [currentText, priorText] = await Promise.all([
    getFilingDocument(currentFiling.accessionNumber, currentFiling.primaryDocument, upperSymbol),
    getFilingDocument(priorFiling.accessionNumber, priorFiling.primaryDocument, upperSymbol),
  ])

  // Extract sections
  const extractFn = filingType === "10-K" ? extractSections : extractQuarterlySections
  const currentSections = extractFn(currentText)
  const priorSections = extractFn(priorText)

  // Build section comparisons
  const allSectionNames = new Set([
    ...currentSections.map(s => s.name),
    ...priorSections.map(s => s.name),
  ])

  const sectionComparisons: SectionComparison[] = []

  for (const name of Array.from(allSectionNames)) {
    const current = currentSections.find(s => s.name === name)
    const prior = priorSections.find(s => s.name === name)

    sectionComparisons.push({
      section: name,
      currentWordCount: current?.wordCount ?? 0,
      priorWordCount: prior?.wordCount ?? 0,
      wordCountChange: (current?.wordCount ?? 0) - (prior?.wordCount ?? 0),
      currentExcerpt: current
        ? current.content.slice(0, EXCERPT_LENGTH)
        : "(Section not found in current filing)",
      priorExcerpt: prior
        ? prior.content.slice(0, EXCERPT_LENGTH)
        : "(Section not found in prior filing)",
    })
  }

  const currentExtract: FilingExtract = {
    type: filingType,
    date: currentFiling.date,
    accessionNumber: currentFiling.accessionNumber,
    sections: currentSections.map(s => ({
      name: s.name,
      content: s.content.slice(0, EXCERPT_LENGTH),
      wordCount: s.wordCount,
    })),
    totalWordCount: currentSections.reduce((s, sec) => s + sec.wordCount, 0),
  }

  const priorExtract: FilingExtract = {
    type: filingType,
    date: priorFiling.date,
    accessionNumber: priorFiling.accessionNumber,
    sections: priorSections.map(s => ({
      name: s.name,
      content: s.content.slice(0, EXCERPT_LENGTH),
      wordCount: s.wordCount,
    })),
    totalWordCount: priorSections.reduce((s, sec) => s + sec.wordCount, 0),
  }

  return {
    symbol: upperSymbol,
    filingType,
    current: currentExtract,
    prior: priorExtract,
    sectionComparisons,
    instruction: `Compare the two ${filingType} filings for ${upperSymbol} (current: ${currentFiling.date} vs prior: ${priorFiling.date}). For each section, analyze:

1. **Risk Factors**: What new risks were added? What risks were removed? How has the risk language changed (more/less cautious)? Any material new disclosures?

2. **MD&A**: How has management's tone shifted? Are they more optimistic or cautious? Key changes in revenue drivers, cost structure, or strategic priorities? Any new headwinds or tailwinds mentioned?

3. **Business Description**: Any changes in business model, segments, or competitive positioning?

4. **Word Count Changes**: Significant increases in a section may indicate new disclosures or growing complexity. Decreases may indicate resolved issues or streamlined operations.

Provide a structured comparison highlighting the most material changes and their investment implications. Flag any red flags (new litigation, regulatory risks, going concern language) or positive signals (expanding markets, improving margins, new product launches).`,
  }
}

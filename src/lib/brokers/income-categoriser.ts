/**
 * Income auto-categorisation engine.
 *
 * Priority order:
 * 1. User-defined rules (exact match on description pattern)
 * 2. Akahu's built-in category
 * 3. Pattern-based heuristics (regular deposits, interest, etc.)
 * 4. Uncategorised → needs_review = true
 */

import type { AkahuTransaction } from "./akahu"

export interface IncomeRule {
  match_pattern: string
  category: string
  source_label: string | null
}

interface CategorisedTransaction {
  transaction: AkahuTransaction
  category: string | null
  sourceLabel: string
  needsReview: boolean
}

// ── Heuristic patterns ────────────────────────────────────

const SALARY_PATTERNS = [
  /salary/i,
  /wages/i,
  /payroll/i,
  /pay\s*run/i,
  /employer/i,
  /net\s*pay/i,
]

const INTEREST_PATTERNS = [
  /interest/i,
  /int\s*credit/i,
  /bonus\s*saver/i,
  /term\s*deposit/i,
]

const RENTAL_PATTERNS = [
  /rent/i,
  /tenant/i,
  /property\s*manager/i,
  /lodge/i,
  /letting/i,
]

const GOVERNMENT_PATTERNS = [
  /ird/i,
  /inland\s*revenue/i,
  /winz/i,
  /studylink/i,
  /msd/i,
  /working\s*for\s*families/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Categorise a single income transaction using heuristics.
 * Returns null if no confident match — these go to the review inbox.
 */
function heuristicCategorise(tx: AkahuTransaction): { category: string; confidence: "high" | "medium" } | null {
  const desc = tx.description.toLowerCase()
  const akahuCat = tx.category?.toLowerCase() ?? ""

  // Akahu categories that map directly
  if (akahuCat.includes("salary") || akahuCat.includes("wages") || akahuCat.includes("income")) {
    return { category: "salary", confidence: "high" }
  }
  if (akahuCat.includes("interest")) {
    return { category: "interest", confidence: "high" }
  }
  if (akahuCat.includes("rent")) {
    return { category: "rental", confidence: "high" }
  }

  // Pattern matching on description
  if (matchesAny(desc, SALARY_PATTERNS)) {
    return { category: "salary", confidence: "medium" }
  }
  if (matchesAny(desc, INTEREST_PATTERNS)) {
    return { category: "interest", confidence: "high" }
  }
  if (matchesAny(desc, RENTAL_PATTERNS)) {
    return { category: "rental", confidence: "medium" }
  }
  if (matchesAny(desc, GOVERNMENT_PATTERNS)) {
    return { category: "other", confidence: "medium" }
  }

  return null
}

/**
 * Categorise a batch of income transactions.
 * Applies user rules first, then heuristics, then marks remaining for review.
 */
export function categoriseTransactions(
  transactions: AkahuTransaction[],
  userRules: IncomeRule[]
): CategorisedTransaction[] {
  // Only process income (positive amounts)
  const incomeTransactions = transactions.filter((t) => t.amount > 0)

  return incomeTransactions.map((tx) => {
    const descLower = tx.description.toLowerCase()

    // 1. Check user rules first (highest priority)
    for (const rule of userRules) {
      if (descLower.includes(rule.match_pattern.toLowerCase())) {
        return {
          transaction: tx,
          category: rule.category,
          sourceLabel: rule.source_label ?? tx.merchant ?? tx.description,
          needsReview: false,
        }
      }
    }

    // 2. Heuristic categorisation
    const heuristic = heuristicCategorise(tx)
    if (heuristic && heuristic.confidence === "high") {
      return {
        transaction: tx,
        category: heuristic.category,
        sourceLabel: tx.merchant ?? tx.description,
        needsReview: false,
      }
    }

    // 3. Medium confidence — categorise but flag for review
    if (heuristic && heuristic.confidence === "medium") {
      return {
        transaction: tx,
        category: heuristic.category,
        sourceLabel: tx.merchant ?? tx.description,
        needsReview: true,
      }
    }

    // 4. No match — needs review
    return {
      transaction: tx,
      category: null,
      sourceLabel: tx.merchant ?? tx.description,
      needsReview: true,
    }
  })
}

/**
 * Generate a match pattern from a transaction description.
 * Strips numbers/dates to create a reusable pattern.
 */
export function generateMatchPattern(description: string): string {
  return description
    .replace(/\d{2}\/\d{2}\/\d{2,4}/g, "") // Remove dates
    .replace(/\d{4,}/g, "") // Remove long numbers (account refs)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

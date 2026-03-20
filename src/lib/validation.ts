/** Validates a stock/ETF symbol format (1-20 alphanumeric chars, dots, hyphens) */
export function isValidSymbol(symbol: string | null | undefined): symbol is string {
  if (!symbol) return false
  return /^[A-Za-z0-9.\-]{1,20}$/.test(symbol)
}

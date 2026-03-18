"use client"

// Re-export from provider — currency is loaded once at app level,
// not re-fetched on every page navigation.
export { useCurrency } from "@/providers/currency-provider"

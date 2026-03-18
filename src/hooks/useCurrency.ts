"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "US$",
  NZD: "NZ$",
  AUD: "A$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
  HKD: "HK$",
  JPY: "¥",
  GBp: "p", // pence for LSE stocks
}

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

function formatAmount(value: number, currencyCode: string): string {
  const sym = symbolFor(currencyCode)
  // JPY and similar don't use decimals
  const decimals = ["JPY", "KRW"].includes(currencyCode) ? 0 : 2
  return `${sym}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

interface UseCurrencyResult {
  /** User's home currency code (e.g. "NZD") */
  homeCurrency: string
  /** FX rate from USD to home currency */
  fxRate: number
  /** Format a price in its native/traded currency. Pass the stock's currency code (defaults to USD). */
  fmtNative: (price: number, stockCurrency?: string) => string
  /** Convert a USD amount to home currency and format it. */
  fmtHome: (usdAmount: number) => string
  /** Format a position showing both native and home currency (e.g. "US$4,521 (NZ$7,234)") */
  fmtBoth: (usdAmount: number) => string
  /** Whether we're still loading the user's currency preference */
  loading: boolean
}

export function useCurrency(): UseCurrencyResult {
  const [homeCurrency, setHomeCurrency] = useState("USD")
  const [fxRate, setFxRate] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("settings")
          .eq("user_id", user.id)
          .single()

        const userCurrency =
          (profile?.settings as { defaultCurrency?: string })
            ?.defaultCurrency ?? "USD"
        setHomeCurrency(userCurrency)

        if (userCurrency !== "USD") {
          try {
            const res = await fetch(
              `/api/market/currency?from=USD&to=${userCurrency}`
            )
            if (res.ok) {
              const data = await res.json()
              setFxRate(data.rate)
            }
          } catch {
            // Fall back to rate 1
          }
        }
      } catch {
        // Fall back to defaults
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const fmtNative = (price: number, stockCurrency?: string): string => {
    return formatAmount(price, stockCurrency ?? "USD")
  }

  const fmtHome = (usdAmount: number): string => {
    return formatAmount(usdAmount * fxRate, homeCurrency)
  }

  const fmtBoth = (usdAmount: number): string => {
    if (homeCurrency === "USD" || fxRate === 1) {
      return formatAmount(usdAmount, "USD")
    }
    return `${formatAmount(usdAmount, "USD")} (${formatAmount(usdAmount * fxRate, homeCurrency)})`
  }

  return { homeCurrency, fxRate, fmtNative, fmtHome, fmtBoth, loading }
}

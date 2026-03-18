"use client"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
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
  GBp: "p",
}

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

function formatAmount(value: number, currencyCode: string): string {
  const sym = symbolFor(currencyCode)
  const decimals = ["JPY", "KRW"].includes(currencyCode) ? 0 : 2
  return `${sym}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

interface CurrencyContextValue {
  homeCurrency: string
  fxRate: number
  fmtNative: (price: number, stockCurrency?: string) => string
  fmtHome: (usdAmount: number) => string
  fmtBoth: (usdAmount: number) => string
  loading: boolean
}

const CurrencyContext = createContext<CurrencyContextValue>({
  homeCurrency: "USD",
  fxRate: 1,
  fmtNative: (price: number) => formatAmount(price, "USD"),
  fmtHome: (usdAmount: number) => formatAmount(usdAmount, "USD"),
  fmtBoth: (usdAmount: number) => formatAmount(usdAmount, "USD"),
  loading: true,
})

export function CurrencyProvider({ children }: { children: ReactNode }) {
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

  const fmtNative = useCallback(
    (price: number, stockCurrency?: string): string => {
      return formatAmount(price, stockCurrency ?? "USD")
    },
    []
  )

  const fmtHome = useCallback(
    (usdAmount: number): string => {
      return formatAmount(usdAmount * fxRate, homeCurrency)
    },
    [fxRate, homeCurrency]
  )

  const fmtBoth = useCallback(
    (usdAmount: number): string => {
      if (homeCurrency === "USD" || fxRate === 1) {
        return formatAmount(usdAmount, "USD")
      }
      return `${formatAmount(usdAmount, "USD")} (${formatAmount(usdAmount * fxRate, homeCurrency)})`
    },
    [fxRate, homeCurrency]
  )

  const value = useMemo(
    () => ({ homeCurrency, fxRate, fmtNative, fmtHome, fmtBoth, loading }),
    [homeCurrency, fxRate, fmtNative, fmtHome, fmtBoth, loading]
  )

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext)
}

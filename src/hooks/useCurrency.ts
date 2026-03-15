"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

const SYMBOLS: Record<string, string> = {
  USD: "$",
  NZD: "NZ$",
  AUD: "A$",
  GBP: "\u00a3",
  EUR: "\u20ac",
}

interface UseCurrencyResult {
  currency: string
  currencySymbol: string
  fxRate: number
  fmt: (val: number) => string
  loading: boolean
}

export function useCurrency(): UseCurrencyResult {
  const [currency, setCurrency] = useState("USD")
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
        setCurrency(userCurrency)

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

  const currencySymbol = SYMBOLS[currency] ?? "$"

  const fmt = (val: number): string =>
    `${currencySymbol}${(val * fxRate).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  return { currency, currencySymbol, fxRate, fmt, loading }
}

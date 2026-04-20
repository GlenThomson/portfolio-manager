"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"

interface CurrencyData {
  currency: string
  currencySymbol: string
  fxRate: number
}

const SYMBOLS: Record<string, string> = {
  USD: "$",
  NZD: "NZ$",
  AUD: "A$",
  GBP: "£",
  EUR: "€",
  CAD: "C$",
}

async function fetchUserCurrency(): Promise<CurrencyData> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { currency: "USD", currencySymbol: "$", fxRate: 1 }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("settings")
    .eq("user_id", user.id)
    .single()

  const currency = (profile?.settings as { defaultCurrency?: string })?.defaultCurrency ?? "USD"
  const currencySymbol = SYMBOLS[currency] ?? "$"

  if (currency === "USD") {
    return { currency, currencySymbol, fxRate: 1 }
  }

  try {
    const res = await fetch(`/api/market/currency?from=USD&to=${currency}`)
    if (res.ok) {
      const data = await res.json()
      return { currency, currencySymbol, fxRate: data.rate }
    }
  } catch {}

  return { currency, currencySymbol, fxRate: 1 }
}

export function useUserCurrency() {
  return useQuery({
    queryKey: ["user-currency"],
    queryFn: fetchUserCurrency,
    staleTime: 10 * 60 * 1000, // 10 min — currency prefs rarely change
    gcTime: 60 * 60 * 1000,
  })
}

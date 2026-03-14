import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getQuote } from "@/lib/market/yahoo"
import { sendAlertTriggeredEmail } from "@/lib/email/resend"

export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch all active alerts for this user
  const { data: activeAlerts, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!activeAlerts || activeAlerts.length === 0) {
    return NextResponse.json({ triggered: [], checked: 0 })
  }

  // Check if user has email alerts enabled
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("settings")
    .eq("user_id", user.id)
    .single()

  const emailAlertsEnabled = profile?.settings &&
    typeof profile.settings === "object" &&
    (profile.settings as Record<string, unknown>).emailAlerts === true

  // Group alerts by symbol to minimize API calls
  const symbolMap = new Map<string, typeof activeAlerts>()
  for (const alert of activeAlerts) {
    const existing = symbolMap.get(alert.symbol) ?? []
    existing.push(alert)
    symbolMap.set(alert.symbol, existing)
  }

  const triggered: Array<{
    id: string
    symbol: string
    condition_type: string
    condition_value: number
    current_price: number
  }> = []

  // Check each symbol's alerts against current market data
  for (const [symbol, alerts] of Array.from(symbolMap.entries())) {
    try {
      const quote = await getQuote(symbol)
      const currentPrice = quote.regularMarketPrice

      if (!currentPrice || currentPrice === 0) continue

      for (const alert of alerts) {
        const targetValue = parseFloat(alert.condition_value)
        let isTriggered = false

        switch (alert.condition_type) {
          case "above":
            isTriggered = currentPrice >= targetValue
            break
          case "below":
            isTriggered = currentPrice <= targetValue
            break
          case "pct_change": {
            const previousClose = quote.regularMarketPreviousClose
            if (previousClose && previousClose > 0) {
              const pctChange =
                ((currentPrice - previousClose) / previousClose) * 100
              // Trigger if absolute percent change exceeds the threshold
              isTriggered = Math.abs(pctChange) >= Math.abs(targetValue)
            }
            break
          }
        }

        if (isTriggered) {
          // Update alert as triggered
          await supabase
            .from("alerts")
            .update({
              is_active: false,
              triggered_at: new Date().toISOString(),
            })
            .eq("id", alert.id)

          triggered.push({
            id: alert.id,
            symbol: alert.symbol,
            condition_type: alert.condition_type,
            condition_value: targetValue,
            current_price: currentPrice,
          })

          // Send email notification if enabled
          if (emailAlertsEnabled && user.email && process.env.RESEND_API_KEY) {
            await sendAlertTriggeredEmail({
              to: user.email,
              symbol: alert.symbol,
              conditionType: alert.condition_type,
              conditionValue: targetValue,
              currentPrice,
            })
          }
        }
      }
    } catch (err) {
      console.error(`Failed to check alerts for ${symbol}:`, err)
    }
  }

  return NextResponse.json({
    triggered,
    checked: activeAlerts.length,
  })
}

import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

interface AlertEmailParams {
  to: string
  symbol: string
  conditionType: "above" | "below" | "pct_change"
  conditionValue: number
  currentPrice: number
}

export async function sendAlertTriggeredEmail({
  to,
  symbol,
  conditionType,
  conditionValue,
  currentPrice,
}: AlertEmailParams) {
  const conditionText =
    conditionType === "above"
      ? `crossed above $${conditionValue.toFixed(2)}`
      : conditionType === "below"
        ? `crossed below $${conditionValue.toFixed(2)}`
        : `moved more than ${conditionValue}%`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Alert: ${symbol} ${conditionText}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px; color: #1a1a1a;">Price Alert Triggered</h2>
          <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
            <div style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px;">${symbol}</div>
            <div style="font-size: 14px; color: #666; margin-bottom: 12px;">${conditionText}</div>
            <div style="font-size: 32px; font-weight: bold; color: ${conditionType === "below" ? "#ef5350" : "#26a69a"};">
              $${currentPrice.toFixed(2)}
            </div>
          </div>
          <p style="font-size: 12px; color: #999; margin: 0;">
            Sent by PortfolioAI — <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://portfolio-manager-plum.vercel.app"}/alerts" style="color: #2962ff;">Manage alerts</a>
          </p>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error("Failed to send alert email:", error)
    return false
  }
}

import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY || "dummy_key_for_build")
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "alerts@resend.dev"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://portfolio-manager-plum.vercel.app"

interface RiskAlertParams {
  to: string
  monitorTitle: string
  score: number
  previousScore: number | null
  threshold: number | null
  changeThreshold: number | null
  reason: "level_crossed" | "change_jumped"
  summary: string
  monitorId: string
}

function severityColor(score: number): string {
  if (score >= 80) return "#ef5350"
  if (score >= 60) return "#ff9500"
  if (score >= 40) return "#ffab00"
  return "#26a69a"
}

export async function sendRiskAlertEmail(params: RiskAlertParams): Promise<{ ok: boolean; error?: string }> {
  const { to, monitorTitle, score, previousScore, threshold, changeThreshold, reason, summary, monitorId } = params

  const color = severityColor(score)
  const detailUrl = `${APP_URL}/risks/${monitorId}`

  const headlineMsg = reason === "level_crossed"
    ? `Crossed your alert threshold of ${threshold}/100`
    : `Moved ${previousScore != null ? (score - previousScore >= 0 ? "+" : "") + (score - previousScore) : "?"} (≥ your ${changeThreshold}-point threshold)`

  const subject = `[ALERT] ${monitorTitle} — ${score}/100`

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#f4f6f8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:560px; margin:0 auto; padding:24px; background:white;">
        <div style="font-size:11px; color:#999; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Risk alert</div>
        <h1 style="margin:0 0 16px; font-size:22px; color:#1a1a1a;">${monitorTitle}</h1>

        <div style="background:#f8f9fa; border-radius:8px; padding:18px; border-left:4px solid ${color}; margin-bottom:16px;">
          <div style="display:flex; align-items:baseline; gap:8px;">
            <span style="font-size:42px; font-weight:bold; color:${color}; line-height:1;">${score}</span>
            <span style="font-size:14px; color:${color};">/ 100</span>
            ${previousScore != null
              ? `<span style="font-size:13px; color:#666; margin-left:8px;">(was ${previousScore})</span>`
              : ""}
          </div>
          <div style="font-size:13px; color:#555; margin-top:8px; font-weight:500;">${headlineMsg}</div>
        </div>

        ${summary ? `<p style="font-size:14px; color:#333; line-height:1.5; margin:0 0 16px;">${summary}</p>` : ""}

        <a href="${detailUrl}"
           style="display:inline-block; background:${color}; color:white; padding:10px 18px; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">
          View risk detail →
        </a>

        <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; color:#999;">
          Sent by PortfolioAI — <a href="${APP_URL}/risks/${monitorId}" style="color:#2962ff;">Adjust thresholds</a>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    })
    return { ok: true }
  } catch (error) {
    console.error("Failed to send risk alert email:", error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

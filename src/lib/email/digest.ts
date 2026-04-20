import { Resend } from "resend"
import type { DigestContent } from "@/lib/digest/generate"

const resend = new Resend(process.env.RESEND_API_KEY || "dummy_key_for_build")
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "alerts@resend.dev"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://portfolio-manager-plum.vercel.app"

function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

function pctColor(n: number): string {
  return n >= 0 ? "#26a69a" : "#ef5350"
}

function severityColor(s: "info" | "warning" | "urgent"): string {
  return s === "urgent" ? "#ef5350" : s === "warning" ? "#ff9500" : "#2962ff"
}

export function renderDigestHtml(content: DigestContent, displayName?: string): string {
  const { portfolio, topMovers, actionRequired, positionsWithoutPlans } = content

  const greeting = displayName ? `Morning, ${displayName}` : "Your morning digest"
  const changeColor = pctColor(portfolio.dayChangePct)

  // Section: Action Required
  const actionHtml = actionRequired.length > 0
    ? `
      <h3 style="margin: 24px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Action required</h3>
      <div>
        ${actionRequired.slice(0, 8).map((a) => `
          <div style="border-left: 3px solid ${severityColor(a.severity)}; padding: 8px 12px; margin-bottom: 8px; background: #f8f9fa; border-radius: 0 6px 6px 0;">
            <div style="font-weight: 600; color: #1a1a1a; font-size: 14px;">${a.title}</div>
            <div style="font-size: 13px; color: #555; margin-top: 2px;">${a.body}</div>
            ${a.actionUrl ? `<a href="${APP_URL}${a.actionUrl}" style="font-size: 12px; color: #2962ff; text-decoration: none;">Open ${a.symbol} →</a>` : ""}
          </div>
        `).join("")}
        ${actionRequired.length > 8 ? `<p style="font-size: 12px; color: #999;">...and ${actionRequired.length - 8} more</p>` : ""}
      </div>
    `
    : `<p style="color: #999; font-size: 13px; margin: 16px 0;">No urgent actions today. Your plans are on track.</p>`

  // Section: Top movers
  const renderPos = (p: typeof topMovers.gainers[number]) => `
    <tr>
      <td style="padding: 6px 0; font-weight: 600;">${p.symbol}</td>
      <td style="padding: 6px 0; text-align: right;">${fmtUsd(p.currentPrice)}</td>
      <td style="padding: 6px 0; text-align: right; color: ${pctColor(p.dayChangePct)}; font-weight: 600;">${fmtPct(p.dayChangePct)}</td>
    </tr>
  `

  const moversHtml = topMovers.gainers.length > 0 || topMovers.losers.length > 0
    ? `
      <h3 style="margin: 24px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Top movers today</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${topMovers.gainers.map(renderPos).join("")}
        ${topMovers.losers.map(renderPos).join("")}
      </table>
    `
    : ""

  // Section: Risks
  const { risks } = content
  const risksToShow = risks.filter((r) =>
    r.score != null && (r.score >= 40 || (r.delta != null && Math.abs(r.delta) >= 10))
  )
  const risksHtml = risks.length > 0
    ? `
      <h3 style="margin: 24px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Risk monitors</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        ${(risksToShow.length > 0 ? risksToShow : risks.slice(0, 3)).map((r) => {
          const score = r.score ?? 0
          const color = score >= 70 ? "#ef5350" : score >= 40 ? "#ff9500" : score >= 20 ? "#ffab00" : "#26a69a"
          const deltaStr = r.delta != null && r.delta !== 0
            ? `<span style="color: ${r.delta > 0 ? "#ef5350" : "#26a69a"}; font-size: 11px;">${r.delta > 0 ? "↑" : "↓"}${Math.abs(r.delta)}</span>`
            : ""
          return `
            <tr>
              <td style="padding: 6px 0; vertical-align: top;">
                <div style="font-weight: 600;">${r.title}</div>
                ${r.summary ? `<div style="font-size: 11px; color: #666; margin-top: 2px;">${r.summary}</div>` : ""}
              </td>
              <td style="padding: 6px 0; text-align: right; vertical-align: top; white-space: nowrap;">
                <span style="font-size: 18px; font-weight: bold; color: ${color};">${Math.round(score)}</span>
                ${deltaStr}
              </td>
            </tr>
          `
        }).join("")}
      </table>
      <p style="font-size: 11px; color: #999; margin: 4px 0;">
        <a href="${APP_URL}/risks" style="color: #2962ff; text-decoration: none;">View all →</a>
      </p>
    `
    : ""

  // Section: Positions without plans nudge
  const noPlanHtml = positionsWithoutPlans.length > 0
    ? `
      <h3 style="margin: 24px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Positions without plans</h3>
      <p style="font-size: 13px; color: #555; margin: 4px 0;">
        ${positionsWithoutPlans.slice(0, 10).join(", ")}${positionsWithoutPlans.length > 10 ? ` +${positionsWithoutPlans.length - 10} more` : ""}
      </p>
      <p style="font-size: 12px; color: #999; margin: 4px 0;">
        <a href="${APP_URL}/portfolio" style="color: #2962ff; text-decoration: none;">Add plans →</a>
      </p>
    `
    : ""

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 24px; background: white;">
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">${content.date}</div>
          <h1 style="margin: 4px 0 0; font-size: 22px; color: #1a1a1a;">${greeting}</h1>
        </div>

        <!-- Portfolio snapshot -->
        <div style="background: #f8f9fa; border-radius: 8px; padding: 18px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Portfolio</div>
          <div style="font-size: 28px; font-weight: bold; color: #1a1a1a; margin: 4px 0;">${fmtUsd(portfolio.totalValue)}</div>
          <div style="font-size: 14px; color: ${changeColor}; font-weight: 600;">
            ${portfolio.dayChange >= 0 ? "+" : ""}${fmtUsd(portfolio.dayChange)} (${fmtPct(portfolio.dayChangePct)}) today
          </div>
          <div style="font-size: 12px; color: #999; margin-top: 6px;">${portfolio.positionCount} position${portfolio.positionCount === 1 ? "" : "s"}</div>
        </div>

        ${actionHtml}
        ${risksHtml}
        ${moversHtml}
        ${noPlanHtml}

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #999;">
          Sent by PortfolioAI — <a href="${APP_URL}/settings" style="color: #2962ff;">Adjust digest preferences</a>
        </div>
      </div>
    </body>
    </html>
  `
}

export async function sendDigestEmail(to: string, content: DigestContent, displayName?: string) {
  const dayChange = content.portfolio.dayChangePct
  const urgent = content.actionRequired.filter((a) => a.severity === "urgent").length
  const subjectPrefix = urgent > 0 ? `[${urgent} action] ` : ""
  const subject = `${subjectPrefix}PortfolioAI digest — ${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)}% today`

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html: renderDigestHtml(content, displayName),
    })
    return { ok: true }
  } catch (error) {
    console.error("Failed to send digest email:", error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

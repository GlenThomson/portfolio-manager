/**
 * Interactive Brokers Web API client — read-only portfolio access via OAuth 2.0
 */

const IBKR_BASE = "https://api.ibkr.com/v1/api"

// These must be set in env vars (IBKR_CLIENT_ID, IBKR_CLIENT_SECRET, IBKR_REDIRECT_URI)
function getConfig() {
  const clientId = process.env.IBKR_CLIENT_ID
  const clientSecret = process.env.IBKR_CLIENT_SECRET
  const redirectUri = process.env.IBKR_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing IBKR OAuth environment variables")
  }
  return { clientId, clientSecret, redirectUri }
}

/** Build the OAuth authorization URL that the user should be redirected to */
export function getAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getConfig()
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "readonly",
    state,
  })
  return `https://www.interactivebrokers.com/authorize?${params.toString()}`
}

/** Exchange the authorization code for access + refresh tokens */
export async function exchangeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const { clientId, clientSecret, redirectUri } = getConfig()

  const res = await fetch("https://www.interactivebrokers.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`IBKR token exchange failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/** Refresh an expired access token */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const { clientId, clientSecret } = getConfig()

  const res = await fetch("https://www.interactivebrokers.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    throw new Error(`IBKR token refresh failed: ${res.status}`)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

// ── Portfolio data fetching ──────────────────────────────

interface IBKRPosition {
  conid: number
  ticker: string
  position: number
  mktPrice: number
  avgCost: number
  assetClass: string
}

export interface NormalizedPosition {
  symbol: string
  quantity: number
  averageCost: number
  assetType: "stock" | "etf" | "crypto" | "option" | "bond" | "other"
  brokerRef: string // conid-based unique ref
}

function mapAssetType(assetClass: string): NormalizedPosition["assetType"] {
  const map: Record<string, NormalizedPosition["assetType"]> = {
    STK: "stock",
    ETF: "etf",
    OPT: "option",
    BOND: "bond",
    CRYPTO: "crypto",
  }
  return map[assetClass] ?? "other"
}

/** Fetch all accounts for the authenticated user */
async function fetchAccounts(accessToken: string): Promise<string[]> {
  const res = await fetch(`${IBKR_BASE}/portfolio/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`IBKR accounts fetch failed: ${res.status}`)
  const data = await res.json()
  return data.map((a: { accountId: string }) => a.accountId)
}

/** Fetch positions for a specific account */
export async function fetchPositions(
  accessToken: string,
  accountId?: string
): Promise<NormalizedPosition[]> {
  const accounts = accountId ? [accountId] : await fetchAccounts(accessToken)
  const allPositions: NormalizedPosition[] = []

  for (const acct of accounts) {
    const res = await fetch(
      `${IBKR_BASE}/portfolio/${acct}/positions/0`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) continue

    const positions: IBKRPosition[] = await res.json()
    for (const p of positions) {
      if (p.position === 0) continue
      allPositions.push({
        symbol: p.ticker,
        quantity: Math.abs(p.position),
        averageCost: p.avgCost,
        assetType: mapAssetType(p.assetClass),
        brokerRef: `ibkr-${acct}-${p.conid}`,
      })
    }
  }

  return allPositions
}

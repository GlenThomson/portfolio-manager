/**
 * Akahu (NZ Open Banking) client — access to NZ bank accounts, investments, and transactions.
 *
 * For personal apps: uses AKAHU_APP_TOKEN + AKAHU_USER_TOKEN directly (no OAuth needed).
 * For multi-user apps: uses AKAHU_APP_TOKEN + AKAHU_APP_SECRET with OAuth flow.
 */

import { AkahuClient } from "akahu"

function getAppToken(): string {
  const appToken = process.env.AKAHU_APP_TOKEN
  if (!appToken) {
    throw new Error("Missing AKAHU_APP_TOKEN environment variable")
  }
  return appToken
}

function getClient() {
  const appToken = getAppToken()
  // Personal apps don't have an appSecret — pass undefined
  const appSecret = process.env.AKAHU_APP_SECRET
  return new AkahuClient({ appToken, ...(appSecret ? { appSecret } : {}) })
}

/** Check if Akahu is configured (at minimum need app token + user token) */
export function isAkahuConfigured(): boolean {
  return !!(process.env.AKAHU_APP_TOKEN && process.env.AKAHU_USER_TOKEN)
}

/** Get the personal app user token from env vars */
export function getPersonalUserToken(): string | null {
  return process.env.AKAHU_USER_TOKEN ?? null
}

// ── OAuth flow (for multi-user / full apps only) ──────────

/** Build the Akahu OAuth authorization URL */
export function getAuthorizeUrl(state: string): string {
  const appToken = getAppToken()
  const redirectUri = process.env.AKAHU_REDIRECT_URI
  if (!redirectUri) {
    throw new Error("Missing AKAHU_REDIRECT_URI for OAuth flow")
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: appToken,
    redirect_uri: redirectUri,
    scope: "ENDURING_CONSENT",
    state,
  })
  return `https://oauth.akahu.nz?${params.toString()}`
}

/** Exchange authorization code for a long-lived user token */
export async function exchangeCode(code: string): Promise<string> {
  const redirectUri = process.env.AKAHU_REDIRECT_URI
  if (!redirectUri) {
    throw new Error("Missing AKAHU_REDIRECT_URI for OAuth flow")
  }
  const client = getClient()
  const result = await client.auth.exchange(code, redirectUri)
  return result.access_token
}

// ── Investment data fetching ──────────────────────────────

export interface AkahuHolding {
  name: string
  ticker?: string
  code?: string
  symbol?: string
  quantity: number
  currentValue: number
  pricePerUnit: number
  accountId: string
}

/**
 * Fetch all investment accounts and their holdings from Akahu.
 * Returns raw holdings — caller must resolve ticker symbols.
 */
export async function fetchInvestmentAccounts(userToken: string, appTokenOverride?: string) {
  const client = appTokenOverride
    ? new AkahuClient({ appToken: appTokenOverride })
    : getClient()

  // Retry once on transient network errors (ECONNRESET etc.)
  let accounts
  try {
    accounts = await client.accounts.list(userToken)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === "ECONNRESET" || code === "ETIMEDOUT") {
      await new Promise((r) => setTimeout(r, 1000))
      accounts = await client.accounts.list(userToken)
    } else {
      throw err
    }
  }

  // Filter to investment-type accounts (INVESTMENT, KIWISAVER)
  const investmentAccounts = accounts.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any) => a.type === "INVESTMENT" || a.type === "KIWISAVER"
  )

  const holdings: AkahuHolding[] = []

  for (const account of investmentAccounts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (account as any).meta
    if (!meta?.portfolio) continue

    // Portfolio can be an array of holdings
    const portfolio = Array.isArray(meta.portfolio) ? meta.portfolio : []

    for (const item of portfolio) {
      const name = item.name ?? item.fund_name ?? item.instrument_name ?? ""
      const quantity = parseFloat(item.quantity ?? item.units ?? item.shares ?? "0")
      const currentValue = parseFloat(item.current_value ?? item.balance ?? item.value ?? "0")
      const pricePerUnit = quantity > 0 ? currentValue / quantity : 0

      if (!name || quantity <= 0) continue

      holdings.push({
        name,
        // Sharesies provides ticker symbols directly in the portfolio data
        ticker: item.ticker ?? undefined,
        code: item.code ?? undefined,
        symbol: item.symbol ?? undefined,
        quantity,
        currentValue,
        pricePerUnit,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accountId: (account as any)._id,
      })
    }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accounts: investmentAccounts.map((a: any) => ({
      id: a._id,
      name: a.name,
      type: a.type,
      connection: a.connection?.name,
      balance: a.balance?.current,
      currency: a.balance?.currency ?? "NZD",
    })),
    holdings,
  }
}

// ── Bank account + transaction fetching ─────────────────

export interface AkahuBankAccount {
  id: string
  name: string
  type: string
  connectionName: string
  balance: number
  currency: string
}

/**
 * Fetch all accounts (bank, credit card, mortgage, savings, KiwiSaver)
 * — not just investment accounts.
 */
export async function fetchAllAccounts(userToken: string, appTokenOverride?: string): Promise<AkahuBankAccount[]> {
  const client = appTokenOverride
    ? new AkahuClient({ appToken: appTokenOverride })
    : getClient()

  let accounts
  try {
    accounts = await client.accounts.list(userToken)
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === "ECONNRESET" || code === "ETIMEDOUT") {
      await new Promise((r) => setTimeout(r, 1000))
      accounts = await client.accounts.list(userToken)
    } else {
      throw err
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return accounts.map((a: any) => ({
    id: a._id,
    name: a.name,
    type: a.type, // CHECKING, SAVINGS, CREDITCARD, LOAN, KIWISAVER, INVESTMENT, TERM_DEPOSIT
    connectionName: a.connection?.name ?? "",
    balance: a.balance?.current ?? 0,
    currency: a.balance?.currency ?? "NZD",
  }))
}

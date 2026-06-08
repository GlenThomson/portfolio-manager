import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncWalletForUser } from "@/lib/polymarket/wallet-sync"

export const maxDuration = 30

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const result = await syncWalletForUser(user.id)
    if (result.error === "no_wallet") {
      return NextResponse.json(
        { error: "No wallet address saved. Add your Polymarket wallet in Settings." },
        { status: 400 },
      )
    }
    if (result.error === "invalid_wallet") {
      return NextResponse.json({ error: "Wallet address looks invalid (must be 0x + 40 hex chars)" }, { status: 400 })
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}

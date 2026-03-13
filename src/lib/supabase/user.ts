import { createClient } from "./client"

// Fixed local dev user ID — used when no Supabase auth session exists
const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

export async function getCurrentUserId(): Promise<string> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return user.id
  } catch {
    // Auth failed — fall through to local user
  }
  return LOCAL_USER_ID
}

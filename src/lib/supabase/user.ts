import { createClient } from "./client"

/** Get current authenticated user ID on the client. Throws if not authenticated. */
export async function getCurrentUserId(): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return user.id
}

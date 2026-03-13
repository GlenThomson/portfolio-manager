import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const LOCAL_USER_ID = "00000000-0000-0000-0000-000000000001"

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method is called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

/** Get current user ID on the server, with local dev fallback */
export async function getServerUserId(): Promise<string> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return user.id
  } catch {
    // Auth failed — fall through to local user
  }
  return LOCAL_USER_ID
}

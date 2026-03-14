import { createClient } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { userProfiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { redirect } from "next/navigation"
import { SettingsContent } from "./settings-content"

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))
    .limit(1)

  const displayName = profile?.displayName ?? ""
  const email = user.email ?? ""
  const settings = (profile?.settings as Record<string, unknown>) ?? {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <SettingsContent
        displayName={displayName}
        email={email}
        settings={settings}
      />
    </div>
  )
}

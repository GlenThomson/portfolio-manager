import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db } from "@/lib/db"
import { userProfiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)

    return NextResponse.json({
      displayName: profile?.displayName ?? "",
      email: user.email ?? "",
      settings: profile?.settings ?? {},
    })
  } catch (error) {
    console.error("GET /api/settings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const body = await request.json()
    const { displayName, settings } = body

    // Check if profile exists
    const [existing] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)

    if (existing) {
      // Build update object
      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (displayName !== undefined) updateData.displayName = displayName
      if (settings !== undefined) {
        // Merge settings with existing settings
        updateData.settings = { ...(existing.settings as Record<string, unknown> ?? {}), ...settings }
      }

      await db
        .update(userProfiles)
        .set(updateData)
        .where(eq(userProfiles.userId, user.id))
    } else {
      // Create profile
      await db.insert(userProfiles).values({
        userId: user.id,
        displayName: displayName ?? null,
        settings: settings ?? {},
      })
    }

    // Return updated profile
    const [updated] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1)

    return NextResponse.json({
      displayName: updated?.displayName ?? "",
      email: user.email ?? "",
      settings: updated?.settings ?? {},
    })
  } catch (error) {
    console.error("PATCH /api/settings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

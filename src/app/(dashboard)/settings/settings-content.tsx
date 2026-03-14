"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Palette, SlidersHorizontal, AlertTriangle } from "lucide-react"
import { ProfileSettings } from "./profile-settings"
import { AppearanceSettings } from "./appearance-settings"
import { PreferencesSettings } from "./preferences-settings"
import { DangerZone } from "./danger-zone"

interface SettingsContentProps {
  displayName: string
  email: string
  settings: Record<string, unknown>
}

export function SettingsContent({ displayName, email, settings }: SettingsContentProps) {
  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="profile" className="gap-2">
          <User className="h-4 w-4 hidden sm:block" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="appearance" className="gap-2">
          <Palette className="h-4 w-4 hidden sm:block" />
          Appearance
        </TabsTrigger>
        <TabsTrigger value="preferences" className="gap-2">
          <SlidersHorizontal className="h-4 w-4 hidden sm:block" />
          Preferences
        </TabsTrigger>
        <TabsTrigger value="danger" className="gap-2">
          <AlertTriangle className="h-4 w-4 hidden sm:block" />
          Account
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfileSettings initialDisplayName={displayName} email={email} />
      </TabsContent>

      <TabsContent value="appearance">
        <AppearanceSettings />
      </TabsContent>

      <TabsContent value="preferences">
        <PreferencesSettings
          initialSettings={{
            defaultCurrency: settings.defaultCurrency as string | undefined,
            defaultPaperTrading: settings.defaultPaperTrading as boolean | undefined,
          }}
        />
      </TabsContent>

      <TabsContent value="danger">
        <DangerZone />
      </TabsContent>
    </Tabs>
  )
}

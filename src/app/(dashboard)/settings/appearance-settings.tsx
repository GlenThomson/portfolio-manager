"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Monitor, Moon, Sun, Palette } from "lucide-react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const themes: { value: Theme; label: string; icon: React.ElementType; description: string }[] = [
  { value: "light", label: "Light", icon: Sun, description: "Light background with dark text" },
  { value: "dark", label: "Dark", icon: Moon, description: "Dark background with light text" },
  { value: "system", label: "System", icon: Monitor, description: "Follows your system preference" },
]

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("system")

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null
    if (stored) {
      setTheme(stored)
    }
  }, [])

  function applyTheme(newTheme: Theme) {
    setTheme(newTheme)
    localStorage.setItem("theme", newTheme)

    const root = document.documentElement
    if (newTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.toggle("dark", prefersDark)
    } else {
      root.classList.toggle("dark", newTheme === "dark")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Appearance
        </CardTitle>
        <CardDescription>Customize how the app looks on your device</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {themes.map((t) => (
            <Button
              key={t.value}
              variant="outline"
              onClick={() => applyTheme(t.value)}
              className={cn(
                "h-auto flex-col items-start gap-2 p-4 text-left",
                theme === t.value && "border-primary bg-primary/5 ring-1 ring-primary"
              )}
            >
              <div className="flex items-center gap-2">
                <t.icon className="h-4 w-4" />
                <span className="font-medium">{t.label}</span>
              </div>
              <span className="text-xs text-muted-foreground font-normal">
                {t.description}
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

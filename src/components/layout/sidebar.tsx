"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Briefcase,
  Star,
  BarChart3,
  MessageSquare,
  Bell,
  Settings,
  TrendingUp,
  DollarSign,
  MessageCircleWarning,
  Shield,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Investments", href: "/portfolio", icon: Briefcase },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "Markets", href: "/markets", icon: BarChart3 },
  { label: "Income", href: "/income", icon: DollarSign },
  { label: "Risks", href: "/risks", icon: Shield },
  { label: "AI Chat", href: "/chat", icon: MessageSquare },
]

const secondaryItems = [
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Feedback", href: "/feedback", icon: MessageCircleWarning },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()

  return (
    <aside className={cn(
      "h-screen w-64 flex-col border-r border-border bg-card",
      mobile ? "flex" : "hidden md:flex"
    )}>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4 border-b border-border">
        <TrendingUp className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">PortfolioAI</span>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <Separator className="my-4" />

        <nav className="flex flex-col gap-1">
          {secondaryItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
    </aside>
  )
}

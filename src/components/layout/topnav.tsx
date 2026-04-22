"use client"

import { memo } from "react"
import { TrendingUp, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { SearchCommand } from "./search-command"
import { MarketStatus } from "@/components/market/market-status"
import { InboxWidget } from "./inbox-widget"

export const TopNav = memo(function TopNav() {
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <MobileSidebar />
        </SheetContent>
      </Sheet>

      {/* Mobile logo — hidden when search is present to give it more room */}
      <div className="flex items-center gap-2 md:hidden shrink-0">
        <TrendingUp className="h-5 w-5 text-primary" />
      </div>

      {/* Search with autocomplete */}
      <div className="flex-1 min-w-0">
        <SearchCommand />
      </div>

      {/* Inbox */}
      <InboxWidget />

      {/* Market status */}
      <div className="hidden sm:flex">
        <MarketStatus />
      </div>
    </header>
  )
})

function MobileSidebar() {
  return (
    <div className="flex h-full flex-col bg-card">
      <Sidebar mobile />
    </div>
  )
}

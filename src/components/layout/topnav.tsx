"use client"

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

export function TopNav() {
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

      {/* Mobile logo */}
      <div className="flex items-center gap-2 md:hidden">
        <TrendingUp className="h-5 w-5 text-primary" />
        <span className="font-bold">PortfolioAI</span>
      </div>

      {/* Search with autocomplete */}
      <SearchCommand />

      <div className="flex-1" />

      {/* Market status */}
      <div className="hidden sm:flex">
        <MarketStatus />
      </div>
    </header>
  )
}

function MobileSidebar() {
  return (
    <div className="flex h-full flex-col bg-card">
      <Sidebar mobile />
    </div>
  )
}

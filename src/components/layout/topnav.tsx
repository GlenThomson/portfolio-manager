"use client"

import { TrendingUp, Menu, Search, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { MarketStatus } from "@/components/market/market-status"

interface SearchResult {
  symbol: string
  shortName: string
  exchange: string
  type: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function TopNav() {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debouncedSearch = useDebounce(search, 300)

  // Fetch search results
  useEffect(() => {
    if (debouncedSearch.trim().length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    fetch(`/api/market/search?q=${encodeURIComponent(debouncedSearch.trim())}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setResults(data)
          setShowDropdown(data.length > 0)
          setSelectedIndex(-1)
          setIsSearching(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsSearching(false)
        }
      })

    return () => { cancelled = true }
  }, [debouncedSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const navigateToSymbol = useCallback((symbol: string) => {
    router.push(`/stock/${symbol}`)
    setSearch("")
    setShowDropdown(false)
    setResults([])
    inputRef.current?.blur()
  }, [router])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedIndex >= 0 && results[selectedIndex]) {
      navigateToSymbol(results[selectedIndex].symbol)
    } else if (search.trim()) {
      navigateToSymbol(search.trim().toUpperCase())
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || results.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
    } else if (e.key === "Escape") {
      setShowDropdown(false)
    }
  }

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
      <div ref={dropdownRef} className="relative flex-1 md:max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search stocks (e.g. AAPL, MSFT, Tesla)..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (results.length > 0) setShowDropdown(true) }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>
        </form>

        {/* Dropdown results */}
        {showDropdown && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden">
            {results.map((result, index) => (
              <button
                key={result.symbol}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-accent ${
                  index === selectedIndex ? "bg-accent" : ""
                }`}
                onClick={() => navigateToSymbol(result.symbol)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{result.symbol}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                    {result.shortName}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">{result.exchange}</span>
                  <span className="text-xs text-muted-foreground">{result.type}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

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
      <Sidebar />
    </div>
  )
}

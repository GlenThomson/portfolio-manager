"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2, Clock, TrendingUp, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SearchResult {
  symbol: string
  shortName: string
  exchange: string
  type: string
  price?: number
  change?: number
  changePercent?: number
  currency?: string
}

const RECENT_SEARCHES_KEY = "portfolio-recent-searches"
const MAX_RECENT = 5

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentSearch(symbol: string) {
  if (typeof window === "undefined") return
  try {
    const recent = getRecentSearches().filter((s) => s !== symbol)
    recent.unshift(symbol)
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    )
  } catch {
    // ignore storage errors
  }
}

function clearRecentSearches() {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // ignore
  }
}

function formatPrice(price: number, currency?: string) {
  const sym = currency === "GBp" ? "p" : "$"
  return `${sym}${price.toFixed(2)}`
}

function formatChange(change: number, changePercent: number) {
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`
}

function exchangeLabel(exchange: string): string {
  const map: Record<string, string> = {
    NMS: "NASDAQ",
    NGM: "NASDAQ",
    NCM: "NASDAQ",
    NYQ: "NYSE",
    ASE: "AMEX",
    PCX: "ARCA",
    BTS: "BATS",
    LSE: "LSE",
    NZE: "NZX",
    ASX: "ASX",
    TYO: "TSE",
    HKG: "HKEX",
  }
  return map[exchange] || exchange
}

export function SearchCommand() {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showRecent, setShowRecent] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debouncedSearch = useDebounce(search, 300)

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [])

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
        if (!cancelled && Array.isArray(data)) {
          setResults(data)
          setShowDropdown(true)
          setShowRecent(false)
          setSelectedIndex(-1)
          setIsSearching(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsSearching(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
        setShowRecent(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const navigateToSymbol = useCallback(
    (symbol: string) => {
      addRecentSearch(symbol)
      setRecentSearches(getRecentSearches())
      router.push(`/stock/${symbol}`)
      setSearch("")
      setShowDropdown(false)
      setShowRecent(false)
      setResults([])
      inputRef.current?.blur()
    },
    [router]
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (showRecent && selectedIndex >= 0 && recentSearches[selectedIndex]) {
      navigateToSymbol(recentSearches[selectedIndex])
    } else if (selectedIndex >= 0 && results[selectedIndex]) {
      navigateToSymbol(results[selectedIndex].symbol)
    } else if (search.trim()) {
      navigateToSymbol(search.trim().toUpperCase())
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setShowDropdown(false)
      setShowRecent(false)
      inputRef.current?.blur()
      return
    }

    const items = showRecent ? recentSearches : results
    if (items.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1))
    }
  }

  function handleFocus() {
    if (search.trim().length > 0 && results.length > 0) {
      setShowDropdown(true)
    } else if (search.trim().length === 0) {
      const recent = getRecentSearches()
      setRecentSearches(recent)
      if (recent.length > 0) {
        setShowRecent(true)
        setSelectedIndex(-1)
      }
    }
  }

  function handleClearRecent() {
    clearRecentSearches()
    setRecentSearches([])
    setShowRecent(false)
  }

  const hasNoResults =
    !isSearching &&
    debouncedSearch.trim().length > 0 &&
    results.length === 0 &&
    search.trim().length > 0

  const showSearchDropdown = showDropdown && (results.length > 0 || hasNoResults)

  return (
    <div ref={containerRef} className="relative flex-1 md:max-w-md">
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
            placeholder="Search stocks (e.g. AAPL, MSFT)..."
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (e.target.value.trim().length === 0) {
                setShowDropdown(false)
                const recent = getRecentSearches()
                setRecentSearches(recent)
                if (recent.length > 0) {
                  setShowRecent(true)
                  setSelectedIndex(-1)
                }
              } else {
                setShowRecent(false)
              }
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>
      </form>

      {/* Recent searches dropdown */}
      {showRecent && recentSearches.length > 0 && !showSearchDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Recent Searches
            </span>
            <button
              onClick={handleClearRecent}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          {recentSearches.map((symbol, index) => (
            <button
              key={symbol}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent",
                index === selectedIndex && "bg-accent"
              )}
              onClick={() => navigateToSymbol(symbol)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{symbol}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search results dropdown */}
      {showSearchDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden max-h-[400px] overflow-y-auto">
          {results.length > 0 ? (
            results.map((result, index) => (
              <button
                key={result.symbol}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                  index === selectedIndex && "bg-accent"
                )}
                onClick={() => navigateToSymbol(result.symbol)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex flex-col items-start min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{result.symbol}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 font-normal"
                    >
                      {exchangeLabel(result.exchange)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                    {result.shortName}
                  </span>
                </div>
                <div className="flex flex-col items-end ml-3 shrink-0">
                  {result.price != null && result.price > 0 ? (
                    <>
                      <span className="text-sm font-medium">
                        {formatPrice(result.price, result.currency)}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          (result.change ?? 0) >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        )}
                      >
                        {formatChange(
                          result.change ?? 0,
                          result.changePercent ?? 0
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {result.type}
                    </span>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="flex items-center justify-center px-3 py-6 text-sm text-muted-foreground">
              <X className="h-4 w-4 mr-2 shrink-0" />
              No stocks found for &ldquo;{search.trim()}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  )
}

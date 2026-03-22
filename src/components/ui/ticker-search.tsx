"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Loader2, X } from "lucide-react"
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

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

function exchangeLabel(exchange: string): string {
  const map: Record<string, string> = {
    NMS: "NASDAQ", NGM: "NASDAQ", NCM: "NASDAQ",
    NYQ: "NYSE", ASE: "AMEX", PCX: "ARCA", BTS: "BATS",
    LSE: "LSE", NZE: "NZX", ASX: "ASX", TYO: "TSE", HKG: "HKEX",
  }
  return map[exchange] || exchange
}

interface TickerSearchProps {
  value: string
  onChange: (value: string) => void
  onSelect: (symbol: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  onKeyDown?: (e: React.KeyboardEvent) => void
  autoFocus?: boolean
}

export function TickerSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Search stocks...",
  className,
  inputClassName,
  onKeyDown: externalKeyDown,
  autoFocus,
}: TickerSearchProps) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebounce(value, 300)

  useEffect(() => {
    if (debouncedSearch.trim().length < 1) {
      setResults([])
      setShowDropdown(false)
      return
    }

    let cancelled = false
    setIsSearching(true)

    fetch(`/api/market/search?q=${encodeURIComponent(debouncedSearch.trim())}&prices=false`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setResults(data)
          setShowDropdown(true)
          setSelectedIndex(-1)
          setIsSearching(false)
        }
      })
      .catch(() => {
        if (!cancelled) setIsSearching(false)
      })

    return () => { cancelled = true }
  }, [debouncedSearch])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = useCallback((symbol: string) => {
    onSelect(symbol)
    setShowDropdown(false)
    setResults([])
  }, [onSelect])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setShowDropdown(false)
      return
    }

    if (showDropdown && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        return
      }
      if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault()
        handleSelect(results[selectedIndex].symbol)
        return
      }
    }

    externalKeyDown?.(e)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        {isSearching ? (
          <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim().length > 0 && results.length > 0) setShowDropdown(true)
          }}
          placeholder={placeholder}
          className={cn("pl-7", inputClassName)}
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden max-h-[240px] overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={result.symbol}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent",
                index === selectedIndex && "bg-accent"
              )}
              onClick={() => handleSelect(result.symbol)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex flex-col items-start min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs">{result.symbol}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal">
                    {exchangeLabel(result.exchange)}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                  {result.shortName}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && !isSearching && debouncedSearch.trim().length > 0 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-center px-3 py-4 text-xs text-muted-foreground">
            <X className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            No results for &ldquo;{value.trim()}&rdquo;
          </div>
        </div>
      )}
    </div>
  )
}

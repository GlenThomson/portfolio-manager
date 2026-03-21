"use client"

import { useState, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Upload, RefreshCw, CheckCircle2, AlertCircle, Loader2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react"

interface BrokerConnectProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  portfolioId: string
  onImportComplete: () => void
  ibkrConnected?: boolean
  akahuConnected?: boolean
}

type ImportResult = {
  imported: number
  skipped: number
  total: number
  parseErrors?: string[]
} | null

type CSVStep = "upload" | "map" | "done"

const FIELDS = [
  { value: "symbol", label: "Symbol / Ticker", required: true },
  { value: "quantity", label: "Quantity / Shares", required: true },
  { value: "price", label: "Price / Cost per Share", required: true },
  { value: "totalCost", label: "Total Cost (overrides Price)", required: false },
  { value: "action", label: "Action (Buy/Sell)", required: false },
  { value: "date", label: "Date", required: false },
  { value: "fees", label: "Fees", required: false },
] as const

const ALL_FIELD_OPTIONS = [
  { value: "", label: "— Skip —" },
  ...FIELDS.map((f) => ({ value: f.value, label: f.label })),
] as const

export function BrokerConnectDialog({
  open,
  onOpenChange,
  portfolioId,
  onImportComplete,
  ibkrConnected = false,
  akahuConnected = false,
}: BrokerConnectProps) {
  const [syncing, setSyncing] = useState(false)
  const [akahuSyncing, setAkahuSyncing] = useState(false)
  const [akahuConnecting, setAkahuConnecting] = useState(false)
  const [akahuAppToken, setAkahuAppToken] = useState("")
  const [akahuUserToken, setAkahuUserToken] = useState("")
  const [unresolvedTickers, setUnresolvedTickers] = useState<string[]>([])
  const [tickerOverrides, setTickerOverrides] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // CSV mapping state
  const [csvStep, setCsvStep] = useState<CSVStep>("upload")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({}) // header → field
  const [showSkipped, setShowSkipped] = useState(false)
  const [cashColumns, setCashColumns] = useState<Record<string, string>>({}) // header → currency
  const [replaceImport, setReplaceImport] = useState(false)

  function resetCSV() {
    setCsvStep("upload")
    setCsvFile(null)
    setCsvHeaders([])
    setCsvPreview([])
    setColumnMap({})
    setShowSkipped(false)
    setCashColumns({})
    setReplaceImport(false)
    setResult(null)
    setError(null)
  }

  // Detect cash/wallet columns from headers
  function detectCashColumns(headers: string[]): Record<string, string> {
    const cash: Record<string, string> = {}
    for (const h of headers) {
      const lower = h.toLowerCase()
      if (lower.includes("wallet") || (lower.includes("cash") && lower.includes("balance"))) {
        const parenMatch = h.match(/\(([A-Z]{3})\)/)
        if (parenMatch) {
          cash[h] = parenMatch[1]
        } else {
          const wordMatch = h.match(/^([A-Z]{3})\s/i)
          if (wordMatch) {
            cash[h] = wordMatch[1].toUpperCase()
          }
        }
      }
    }
    return cash
  }

  // Auto-detect common column names — order matters: check fees before action
  function autoDetectMapping(headers: string[]): Record<string, string> {
    const assignments: Record<string, string> = {} // field → header
    const used = new Set<string>()

    // Helper: find first matching header for a field
    function findHeader(field: string, test: (lower: string) => boolean) {
      if (assignments[field]) return
      for (const h of headers) {
        if (used.has(h)) continue
        if (test(h.toLowerCase())) {
          assignments[field] = h
          used.add(h)
          return
        }
      }
    }

    // Symbol — look for exact "ticker", "symbol", or Sharesies "investment ticker symbol"
    findHeader("symbol", (l) =>
      l.includes("ticker") || l.includes("symbol") || l === "code" || l === "instrument"
    )

    // Quantity — "shares", "units", "quantity", "qty" but NOT "dollar value" or "number of shares purchased/sold"
    findHeader("quantity", (l) => {
      if (l.includes("dollar") || l.includes("value") || l.includes("purchased") || l.includes("sold") || l.includes("gained") || l.includes("disposed") || l.includes("number of")) return false
      return l.includes("quantity") || l === "qty" || l === "shares" || l === "units" ||
        (l.includes("shareholding") && l.includes("ending"))
    })

    // Price — "price", "cost", "average" but NOT "dollar value" and prefer "ending share price"
    findHeader("price", (l) => {
      if (l.includes("dollar") || l.includes("value") || l.includes("total")) return false
      if (l.includes("starting")) return false
      return (l.includes("price") || l.includes("cost") || l.includes("average")) && !l.includes("fee")
    })

    // Total Cost — "dollar value of shares purchased"
    findHeader("totalCost", (l) =>
      l.includes("dollar value") && l.includes("purchased")
    )

    // Fees — must match before action to avoid "transaction fees" matching "action"
    findHeader("fees", (l) =>
      (l.includes("fee") || l.includes("commission") || l.includes("brokerage")) && !l.includes("adr")
    )

    // Action — "action", "type", "side", "direction" but NOT "asset type"
    findHeader("action", (l) => {
      if (l.includes("asset") || l.includes("fee") || l.includes("condition")) return false
      return l === "action" || l === "type" || l === "side" || l === "direction" || l.includes("buy/sell")
    })

    // Date
    findHeader("date", (l) => {
      if (l.includes("created") || l.includes("updated") || l.includes("expires")) return false
      return l.includes("date") || l.includes("executed") || l === "time"
    })

    // Invert: field → header becomes header → field
    const result: Record<string, string> = {}
    for (const [field, header] of Object.entries(assignments)) {
      result[header] = field
    }
    return result
  }

  const handleCSVFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    setResult(null)
    setCsvFile(file)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/brokers/csv-import", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to parse CSV")
      }

      const { headers, preview } = await res.json()
      setCsvHeaders(headers)
      setCsvPreview(preview)
      setColumnMap(autoDetectMapping(headers))
      setCashColumns(detectCashColumns(headers))
      setShowSkipped(false)
      setCsvStep("map")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV")
    } finally {
      setUploading(false)
    }
  }, [])

  async function handleImport() {
    if (!csvFile) return

    // Build mapping from columnMap (header → field) into ColumnMapping (field → header)
    const mapping: Record<string, string> = {}
    for (const [header, field] of Object.entries(columnMap)) {
      if (field) mapping[field] = header
    }

    if (!mapping.symbol || !mapping.quantity || (!mapping.price && !mapping.totalCost)) {
      setError("Please map at least Symbol, Quantity, and Price (or Total Cost) columns")
      return
    }

    setImporting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", csvFile)
      formData.append("portfolioId", portfolioId)
      formData.append("mapping", JSON.stringify(mapping))
      if (Object.keys(cashColumns).length > 0) {
        formData.append("cashMapping", JSON.stringify(cashColumns))
      }
      if (replaceImport) {
        formData.append("replace", "true")
      }

      const res = await fetch("/api/brokers/csv-import", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Import failed")
      }

      const data = await res.json()
      setResult(data)
      setCsvStep("done")
      onImportComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  function updateMapping(header: string, field: string) {
    const newMap = { ...columnMap }
    // Remove any other header mapped to this field (prevent duplicates)
    if (field) {
      for (const [k, v] of Object.entries(newMap)) {
        if (v === field) delete newMap[k]
      }
      newMap[header] = field
    } else {
      delete newMap[header]
    }
    setColumnMap(newMap)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleCSVFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith(".csv")) {
      handleCSVFile(file)
    } else {
      setError("Please drop a .csv file")
    }
  }

  async function handleAkahuConnect() {
    setAkahuConnecting(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/brokers/akahu/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appToken: akahuAppToken.trim(), userToken: akahuUserToken.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to connect")
      }

      setAkahuAppToken("")
      setAkahuUserToken("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect")
      setAkahuConnecting(false)
      return
    }

    // Auto-sync immediately after connecting
    try {
      const syncRes = await fetch("/api/brokers/akahu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      })

      if (!syncRes.ok) {
        const data = await syncRes.json()
        throw new Error(data.error || "Sync failed")
      }

      const syncData = await syncRes.json()

      if (syncData.unresolved?.length > 0) {
        setUnresolvedTickers(syncData.unresolved)
      }

      setResult(syncData)
      onImportComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connected but sync failed — try the Sync button")
    } finally {
      setAkahuConnecting(false)
    }
  }

  async function handleAkahuSync() {
    setAkahuSyncing(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/brokers/akahu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, tickerOverrides }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Sync failed")
      }

      const data = await res.json()

      if (data.unresolved?.length > 0) {
        setUnresolvedTickers(data.unresolved)
      }

      if (data.imported > 0 || data.skipped > 0) {
        setResult(data)
        onImportComplete()
      } else if (data.needsMapping) {
        setError("Some holdings could not be matched to tickers. Please map them below.")
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setAkahuSyncing(false)
    }
  }

  async function handleIBKRSync() {
    setSyncing(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/brokers/ibkr/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Sync failed")
      }

      const data = await res.json()
      setResult(data)
      onImportComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  // Compute mapped vs skipped headers
  const mappedHeaders = csvHeaders.filter((h) => columnMap[h])
  const skippedHeaders = csvHeaders.filter((h) => !columnMap[h])
  const mappedFields = new Set(Object.values(columnMap).filter(Boolean))
  const hasRequired = mappedFields.has("symbol") && mappedFields.has("quantity") && (mappedFields.has("price") || mappedFields.has("totalCost"))

  // Get sample value for a header
  const sampleVal = (header: string) => csvPreview[0]?.[header] ?? "—"

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetCSV(); onOpenChange(v) }}>
      <DialogContent className="max-w-[90vw] w-fit min-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Holdings</DialogTitle>
          <DialogDescription>
            Connect a broker or upload a CSV to import your holdings.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sharesies">Sharesies</TabsTrigger>
            <TabsTrigger value="ibkr">Interactive Brokers</TabsTrigger>
            <TabsTrigger value="csv">CSV Import</TabsTrigger>
          </TabsList>

          {/* ── Sharesies (via Akahu) Tab ────────────────── */}
          <TabsContent value="sharesies" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Connect your Sharesies account via Akahu (NZ open banking) to sync your holdings automatically.
              Read-only access — your Sharesies credentials are handled securely by Akahu.
            </p>

            {akahuConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                  Sharesies account connected via Akahu
                </div>

                {/* Unresolved ticker mapping UI */}
                {unresolvedTickers.length > 0 && (
                  <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 space-y-2">
                    <p className="text-sm font-medium text-yellow-500">
                      {unresolvedTickers.length} holding{unresolvedTickers.length !== 1 ? "s" : ""} need manual ticker mapping
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enter the ticker symbol for each holding (e.g. AAPL, FPH.NZ)
                    </p>
                    {unresolvedTickers.map((name) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-sm truncate max-w-[200px]" title={name}>{name}</span>
                        <input
                          type="text"
                          placeholder="TICKER"
                          className="flex-1 text-sm rounded-md border bg-background px-2 py-1 uppercase"
                          value={tickerOverrides[name] ?? ""}
                          onChange={(e) =>
                            setTickerOverrides((prev) => ({
                              ...prev,
                              [name]: e.target.value.toUpperCase(),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleAkahuSync}
                  disabled={akahuSyncing}
                  className="w-full"
                >
                  {akahuSyncing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync Holdings
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border p-3 space-y-3">
                  <p className="text-sm font-medium">Connect with Akahu</p>
                  <p className="text-xs text-muted-foreground">
                    Create a free personal app at{" "}
                    <a href="https://my.akahu.nz/apps" target="_blank" rel="noopener noreferrer" className="underline">
                      my.akahu.nz
                    </a>
                    , connect your Sharesies account, then paste your tokens below.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="App Token (app_token_...)"
                      className="w-full text-sm rounded-md border bg-background px-3 py-2"
                      value={akahuAppToken}
                      onChange={(e) => setAkahuAppToken(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="User Token (user_token_...)"
                      className="w-full text-sm rounded-md border bg-background px-3 py-2"
                      value={akahuUserToken}
                      onChange={(e) => setAkahuUserToken(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleAkahuConnect}
                    disabled={akahuConnecting || !akahuAppToken.trim() || !akahuUserToken.trim()}
                    className="w-full"
                  >
                    {akahuConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Connect
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Interactive Brokers Tab ──────────────────── */}
          <TabsContent value="ibkr" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Connect your Interactive Brokers account to sync positions automatically.
              Uses read-only access — no trading permissions.
            </p>

            {ibkrConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                  IBKR account connected
                </div>
                <Button onClick={handleIBKRSync} disabled={syncing} className="w-full">
                  {syncing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync Positions
                </Button>
              </div>
            ) : (
              <Button asChild className="w-full">
                <a href={`/api/brokers/ibkr/authorize?portfolioId=${portfolioId}`}>
                  Connect Interactive Brokers
                </a>
              </Button>
            )}
          </TabsContent>

          {/* ── CSV Import Tab ──────────────────────────── */}
          <TabsContent value="csv" className="space-y-4 mt-4">

            {/* Step 1: Upload */}
            {csvStep === "upload" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Upload any CSV with your holdings or transactions. You&apos;ll map the columns in the next step.
                </p>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Drop CSV here or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Works with Sharesies, IBKR, Hatch, Stake, or any broker export
                      </p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              </>
            )}

            {/* Step 2: Map Columns */}
            {csvStep === "map" && (
              <>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={resetCSV}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <p className="text-sm text-muted-foreground flex-1">
                    We detected {mappedHeaders.length} field{mappedHeaders.length !== 1 ? "s" : ""}. Review the mapping below.
                  </p>
                </div>

                {/* Mapped fields — shown as clean cards */}
                <div className="space-y-2">
                  {FIELDS.map((field) => {
                    const mappedHeader = Object.entries(columnMap).find(([, v]) => v === field.value)?.[0]
                    return (
                      <div
                        key={field.value}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                          mappedHeader ? "border-border" : "border-dashed border-muted-foreground/25"
                        }`}
                      >
                        <div className="min-w-[130px]">
                          <span className="text-sm font-medium">{field.label}</span>
                          {field.required && <span className="text-red-400 ml-0.5">*</span>}
                        </div>

                        <select
                          className="flex-1 text-sm rounded-md border bg-background px-2 py-1"
                          value={mappedHeader ?? ""}
                          onChange={(e) => {
                            // Unmap old header
                            if (mappedHeader) {
                              const newMap = { ...columnMap }
                              delete newMap[mappedHeader]
                              if (e.target.value) newMap[e.target.value] = field.value
                              setColumnMap(newMap)
                            } else if (e.target.value) {
                              updateMapping(e.target.value, field.value)
                            }
                          }}
                        >
                          <option value="">— Not mapped —</option>
                          {csvHeaders.map((h) => (
                            <option key={h} value={h} disabled={!!columnMap[h] && columnMap[h] !== field.value}>
                              {h}
                            </option>
                          ))}
                        </select>

                        {mappedHeader && (
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={sampleVal(mappedHeader)}>
                            e.g. {sampleVal(mappedHeader)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Status */}
                <div className="text-xs text-muted-foreground">
                  {hasRequired ? (
                    <span className="text-green-500">Required fields mapped</span>
                  ) : (
                    <span className="text-yellow-500">Map at least Symbol, Quantity, and Price or Total Cost</span>
                  )}
                  {!mappedFields.has("action") && <span> &middot; No Action column — all rows imported as buys</span>}
                </div>

                {/* Skipped columns — collapsible */}
                {skippedHeaders.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowSkipped(!showSkipped)}
                    >
                      {showSkipped ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {skippedHeaders.length} column{skippedHeaders.length !== 1 ? "s" : ""} skipped
                    </button>
                    {showSkipped && (
                      <div className="mt-2 space-y-1">
                        {skippedHeaders.map((h) => (
                          <div key={h} className="flex items-center gap-2 text-xs text-muted-foreground pl-4">
                            <span className="font-mono truncate max-w-[200px]" title={h}>{h}</span>
                            <span className="truncate max-w-[120px]" title={sampleVal(h)}>= {sampleVal(h)}</span>
                            <select
                              className="ml-auto text-xs rounded border bg-background px-1 py-0.5"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) updateMapping(h, e.target.value)
                              }}
                            >
                              <option value="">Map to...</option>
                              {ALL_FIELD_OPTIONS.filter((o) => o.value && !mappedFields.has(o.value)).map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Cash columns — auto-detected toggles */}
                {Object.keys(cashColumns).length > 0 && (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-medium">Cash Balances Detected</p>
                    <p className="text-xs text-muted-foreground">
                      These columns look like cash/wallet balances. Toggle to include them.
                    </p>
                    {Object.entries(cashColumns).map(([header, currency]) => {
                      const balance = csvPreview[csvPreview.length - 1]?.[header] ?? "—"
                      return (
                        <label key={header} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={(e) => {
                              if (!e.target.checked) {
                                const next = { ...cashColumns }
                                delete next[header]
                                setCashColumns(next)
                              }
                            }}
                            className="rounded"
                          />
                          <span className="font-mono text-xs">{header}</span>
                          <span className="text-muted-foreground text-xs">→ {currency}-CASH</span>
                          <span className="ml-auto text-xs text-muted-foreground">{balance}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {/* Replace previous import checkbox */}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceImport}
                    onChange={(e) => setReplaceImport(e.target.checked)}
                    className="rounded"
                  />
                  <span>Replace previous CSV import</span>
                  <span className="text-xs text-muted-foreground">(removes old data before importing)</span>
                </label>

                <Button
                  onClick={handleImport}
                  disabled={!hasRequired || importing}
                  className="w-full"
                >
                  {importing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Import Holdings
                </Button>
              </>
            )}

            {/* Step 3: Done */}
            {csvStep === "done" && (
              <div className="space-y-3">
                <Button variant="outline" size="sm" onClick={resetCSV}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Import another file
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Result / Error display ────────────────────── */}
        {result && (
          <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3 mt-2">
            <div className="flex items-center gap-2 text-sm text-green-500 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Import complete
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {result.imported} imported, {result.skipped} skipped (duplicates), {result.total} total
            </p>
            {result.parseErrors && result.parseErrors.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-yellow-500 cursor-pointer">
                  {result.parseErrors.length} parse warning(s)
                </summary>
                <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                  {result.parseErrors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mt-2">
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

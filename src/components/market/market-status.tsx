"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Status = "open" | "closed" | "pre-market" | "after-hours"

interface MarketInfo {
  status: Status
  nextEvent: string
}

// ---------------------------------------------------------------------------
// US Holiday helpers
// ---------------------------------------------------------------------------

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  // Returns the nth occurrence of `weekday` (0=Sun..6=Sat) in the given month.
  const first = new Date(year, month, 1)
  let day = 1 + ((weekday - first.getDay() + 7) % 7)
  day += (n - 1) * 7
  return new Date(year, month, day)
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0) // last day of month
  const diff = (last.getDay() - weekday + 7) % 7
  return new Date(year, month, last.getDate() - diff)
}

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function getUSHolidays(year: number): Set<string> {
  const holidays = new Set<string>()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  // New Year's Day - Jan 1 (observed)
  let ny = new Date(year, 0, 1)
  if (ny.getDay() === 0) ny = new Date(year, 0, 2) // Sunday -> Monday
  if (ny.getDay() === 6) ny = new Date(year - 1, 11, 31) // Saturday -> Friday (prev year, but include anyway)
  holidays.add(fmt(ny))
  // Also check if Jan 1 of next year is observed in this year
  const nyNext = new Date(year + 1, 0, 1)
  if (nyNext.getDay() === 6) holidays.add(fmt(new Date(year, 11, 31)))

  // MLK Day - 3rd Monday of January
  holidays.add(fmt(nthWeekday(year, 0, 1, 3)))

  // Presidents Day - 3rd Monday of February
  holidays.add(fmt(nthWeekday(year, 1, 1, 3)))

  // Good Friday - 2 days before Easter Sunday
  const easter = easterSunday(year)
  const goodFriday = new Date(easter.getTime() - 2 * 86400000)
  holidays.add(fmt(goodFriday))

  // Memorial Day - last Monday of May
  holidays.add(fmt(lastWeekday(year, 4, 1)))

  // Juneteenth - June 19 (observed)
  let june19 = new Date(year, 5, 19)
  if (june19.getDay() === 0) june19 = new Date(year, 5, 20)
  if (june19.getDay() === 6) june19 = new Date(year, 5, 18)
  holidays.add(fmt(june19))

  // Independence Day - July 4 (observed)
  let july4 = new Date(year, 6, 4)
  if (july4.getDay() === 0) july4 = new Date(year, 6, 5)
  if (july4.getDay() === 6) july4 = new Date(year, 6, 3)
  holidays.add(fmt(july4))

  // Labor Day - 1st Monday of September
  holidays.add(fmt(nthWeekday(year, 8, 1, 1)))

  // Thanksgiving - 4th Thursday of November
  holidays.add(fmt(nthWeekday(year, 10, 4, 4)))

  // Christmas - Dec 25 (observed)
  let xmas = new Date(year, 11, 25)
  if (xmas.getDay() === 0) xmas = new Date(year, 11, 26)
  if (xmas.getDay() === 6) xmas = new Date(year, 11, 24)
  holidays.add(fmt(xmas))

  return holidays
}

function isUSHoliday(etDate: Date): boolean {
  const year = etDate.getFullYear()
  const key = `${year}-${String(etDate.getMonth() + 1).padStart(2, "0")}-${String(etDate.getDate()).padStart(2, "0")}`
  const holidays = getUSHolidays(year)
  return holidays.has(key)
}

// ---------------------------------------------------------------------------
// NZ Holiday helpers (basic set — market-closing holidays only)
// ---------------------------------------------------------------------------

function getNZHolidays(year: number): Set<string> {
  const holidays = new Set<string>()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  const mondayise = (d: Date): Date => {
    if (d.getDay() === 0) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    if (d.getDay() === 6) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2)
    return d
  }

  // New Year's Day & Day After
  holidays.add(fmt(mondayise(new Date(year, 0, 1))))
  let jan2 = new Date(year, 0, 2)
  if (jan2.getDay() === 0) jan2 = new Date(year, 0, 3)
  if (jan2.getDay() === 6) jan2 = new Date(year, 0, 4)
  if (jan2.getDay() === 1 && new Date(year, 0, 1).getDay() === 0) jan2 = new Date(year, 0, 3) // both mondayised
  holidays.add(fmt(jan2))

  // Waitangi Day - Feb 6
  holidays.add(fmt(mondayise(new Date(year, 1, 6))))

  // ANZAC Day - Apr 25
  holidays.add(fmt(mondayise(new Date(year, 3, 25))))

  // Good Friday & Easter Monday
  const easter = easterSunday(year)
  holidays.add(fmt(new Date(easter.getTime() - 2 * 86400000))) // Good Friday
  holidays.add(fmt(new Date(easter.getTime() + 1 * 86400000))) // Easter Monday

  // King's Birthday - 1st Monday of June
  holidays.add(fmt(nthWeekday(year, 5, 1, 1)))

  // Matariki — approximate (varies, but close enough for indicator purposes)
  // Matariki is set by the Maori calendar; we use known/approximate dates
  const matarikiDates: Record<number, [number, number]> = {
    2024: [5, 28], 2025: [5, 20], 2026: [6, 10], 2027: [5, 25],
    2028: [6, 14], 2029: [6, 6], 2030: [5, 21],
  }
  if (matarikiDates[year]) {
    const [m, d] = matarikiDates[year]
    holidays.add(fmt(new Date(year, m, d)))
  }

  // Labour Day - 4th Monday of October
  holidays.add(fmt(nthWeekday(year, 9, 1, 4)))

  // Christmas & Boxing Day
  holidays.add(fmt(mondayise(new Date(year, 11, 25))))
  let boxing = new Date(year, 11, 26)
  if (boxing.getDay() === 0) boxing = new Date(year, 11, 28)
  if (boxing.getDay() === 6) boxing = new Date(year, 11, 28)
  if (boxing.getDay() === 1 && new Date(year, 11, 25).getDay() === 0) boxing = new Date(year, 11, 28)
  holidays.add(fmt(boxing))

  return holidays
}

function isNZHoliday(nzDate: Date): boolean {
  const year = nzDate.getFullYear()
  const key = `${year}-${String(nzDate.getMonth() + 1).padStart(2, "0")}-${String(nzDate.getDate()).padStart(2, "0")}`
  return getNZHolidays(year).has(key)
}

// ---------------------------------------------------------------------------
// Time formatting helper
// ---------------------------------------------------------------------------

function formatCountdown(totalMinutes: number): string {
  if (totalMinutes <= 0) return "now"
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function dateInTZ(tz: string): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }))
}

// ---------------------------------------------------------------------------
// US Market Status
// ---------------------------------------------------------------------------

function getUSMarketStatus(): MarketInfo {
  const et = dateInTZ("America/New_York")
  const day = et.getDay()
  const time = et.getHours() * 60 + et.getMinutes()

  // Weekend or holiday
  if (day === 0 || day === 6 || isUSHoliday(et)) {
    // Figure out next trading day
    const next = new Date(et)
    do {
      next.setDate(next.getDate() + 1)
    } while (next.getDay() === 0 || next.getDay() === 6 || isUSHoliday(next))

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return { status: "closed", nextEvent: `Opens ${dayNames[next.getDay()]} 9:30 AM` }
  }

  const PRE = 4 * 60      // 4:00 AM
  const OPEN = 9 * 60 + 30 // 9:30 AM
  const CLOSE = 16 * 60    // 4:00 PM
  const AFTER = 20 * 60    // 8:00 PM

  if (time < PRE) {
    return { status: "closed", nextEvent: `Pre-market in ${formatCountdown(PRE - time)}` }
  } else if (time < OPEN) {
    return { status: "pre-market", nextEvent: `Opens in ${formatCountdown(OPEN - time)}` }
  } else if (time < CLOSE) {
    return { status: "open", nextEvent: `Closes in ${formatCountdown(CLOSE - time)}` }
  } else if (time < AFTER) {
    return { status: "after-hours", nextEvent: `Ends in ${formatCountdown(AFTER - time)}` }
  }

  return { status: "closed", nextEvent: "Opens tomorrow 9:30 AM" }
}

// ---------------------------------------------------------------------------
// NZX Market Status
// ---------------------------------------------------------------------------

function getNZXMarketStatus(): MarketInfo {
  const nz = dateInTZ("Pacific/Auckland")
  const day = nz.getDay()
  const time = nz.getHours() * 60 + nz.getMinutes()

  // Weekend or holiday
  if (day === 0 || day === 6 || isNZHoliday(nz)) {
    const next = new Date(nz)
    do {
      next.setDate(next.getDate() + 1)
    } while (next.getDay() === 0 || next.getDay() === 6 || isNZHoliday(next))

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return { status: "closed", nextEvent: `Opens ${dayNames[next.getDay()]} 10:00 AM` }
  }

  const OPEN = 10 * 60       // 10:00 AM
  const CLOSE = 16 * 60 + 45 // 4:45 PM

  if (time < OPEN) {
    return { status: "closed", nextEvent: `Opens in ${formatCountdown(OPEN - time)}` }
  } else if (time < CLOSE) {
    return { status: "open", nextEvent: `Closes in ${formatCountdown(CLOSE - time)}` }
  }

  return { status: "closed", nextEvent: "Opens tomorrow 10:00 AM" }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusConfig: Record<Status, { label: string; color: string; dot: string; pulse: string }> = {
  open: {
    label: "Open",
    color: "text-green-400",
    dot: "bg-green-500",
    pulse: "bg-green-500/40",
  },
  closed: {
    label: "Closed",
    color: "text-red-400",
    dot: "bg-red-500",
    pulse: "",
  },
  "pre-market": {
    label: "Pre-Market",
    color: "text-yellow-400",
    dot: "bg-yellow-500",
    pulse: "bg-yellow-500/40",
  },
  "after-hours": {
    label: "After-Hours",
    color: "text-yellow-400",
    dot: "bg-yellow-500",
    pulse: "bg-yellow-500/40",
  },
}

// ---------------------------------------------------------------------------
// Single market pill
// ---------------------------------------------------------------------------

function MarketPill({
  exchange,
  info,
}: {
  exchange: string
  info: MarketInfo
}) {
  const cfg = statusConfig[info.status]

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-background/50 border border-border/50 px-2.5 py-1">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {exchange}
      </span>
      <span className="relative flex h-2 w-2">
        {cfg.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              cfg.pulse
            )}
          />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", cfg.dot)} />
      </span>
      <span className={cn("text-xs font-medium", cfg.color)}>
        {cfg.label}
      </span>
      <span className="text-[11px] text-muted-foreground hidden lg:inline">
        {info.nextEvent}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export function MarketStatus() {
  const [us, setUS] = useState<MarketInfo>({ status: "closed", nextEvent: "" })
  const [nz, setNZ] = useState<MarketInfo>({ status: "closed", nextEvent: "" })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    function update() {
      setUS(getUSMarketStatus())
      setNZ(getNZXMarketStatus())
    }
    update()
    setMounted(true)
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!mounted) return null

  return (
    <div className="flex items-center gap-1.5">
      <MarketPill exchange="NYSE" info={us} />
      <MarketPill exchange="NZX" info={nz} />
    </div>
  )
}

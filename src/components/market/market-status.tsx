"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Status = "open" | "closed" | "pre-market" | "after-hours"

function getMarketStatus(): { status: Status; nextEvent: string } {
  const now = new Date()
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }))
  const day = et.getDay()
  const hours = et.getHours()
  const minutes = et.getMinutes()
  const time = hours * 60 + minutes

  // Weekend
  if (day === 0 || day === 6) {
    return { status: "closed", nextEvent: "Opens Monday 9:30 AM ET" }
  }

  const preMarketOpen = 4 * 60 // 4:00 AM
  const marketOpen = 9 * 60 + 30 // 9:30 AM
  const marketClose = 16 * 60 // 4:00 PM
  const afterHoursClose = 20 * 60 // 8:00 PM

  if (time < preMarketOpen) {
    return { status: "closed", nextEvent: "Pre-market at 4:00 AM ET" }
  } else if (time < marketOpen) {
    const minsLeft = marketOpen - time
    const h = Math.floor(minsLeft / 60)
    const m = minsLeft % 60
    return { status: "pre-market", nextEvent: `Opens in ${h}h ${m}m` }
  } else if (time < marketClose) {
    const minsLeft = marketClose - time
    const h = Math.floor(minsLeft / 60)
    const m = minsLeft % 60
    return { status: "open", nextEvent: `Closes in ${h}h ${m}m` }
  } else if (time < afterHoursClose) {
    const minsLeft = afterHoursClose - time
    const h = Math.floor(minsLeft / 60)
    const m = minsLeft % 60
    return { status: "after-hours", nextEvent: `After-hours ends in ${h}h ${m}m` }
  }

  return { status: "closed", nextEvent: "Opens tomorrow 9:30 AM ET" }
}

const statusConfig: Record<Status, { label: string; color: string; dot: string }> = {
  open: { label: "Market Open", color: "text-green-500", dot: "bg-green-500" },
  closed: { label: "Market Closed", color: "text-red-500", dot: "bg-red-500" },
  "pre-market": { label: "Pre-Market", color: "text-yellow-500", dot: "bg-yellow-500" },
  "after-hours": { label: "After-Hours", color: "text-blue-500", dot: "bg-blue-500" },
}

export function MarketStatus() {
  const [status, setStatus] = useState<{ status: Status; nextEvent: string }>({
    status: "closed",
    nextEvent: "",
  })

  useEffect(() => {
    setStatus(getMarketStatus())
    const interval = setInterval(() => setStatus(getMarketStatus()), 60000)
    return () => clearInterval(interval)
  }, [])

  const config = statusConfig[status.status]

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={cn("h-2 w-2 rounded-full", config.dot)} />
      <span className={cn("font-medium", config.color)}>{config.label}</span>
      <span className="text-muted-foreground hidden lg:inline">{status.nextEvent}</span>
    </div>
  )
}

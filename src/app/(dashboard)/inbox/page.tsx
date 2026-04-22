"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2, Check, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface InboxItem {
  id: string
  type: string
  severity: "info" | "warning" | "urgent"
  title: string
  body: string | null
  symbol: string | null
  action_url: string | null
  read_at: string | null
  created_at: string
}

function severityColor(s: InboxItem["severity"]) {
  return s === "urgent" ? "#ef5350" : s === "warning" ? "#ff9500" : "#2962ff"
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "unread">("all")

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/inbox?limit=200${filter === "unread" ? "&unread=true" : ""}`)
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, read_at: new Date().toISOString() } : i))
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
  }

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`/api/inbox?id=${id}`, { method: "DELETE" })
  }

  const markAllRead = async () => {
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    })
    fetchInbox()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div className="flex gap-2">
          <div className="flex gap-0.5 rounded p-0.5" style={{ background: "#1e222d" }}>
            {(["all", "unread"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "px-3 py-1 text-xs rounded capitalize transition-colors",
                  filter === k ? "bg-[#2a2e39] text-[#d1d4dc] font-medium" : "text-[#787b86]"
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <Check className="h-3.5 w-3.5 mr-1" /> Mark all read
          </Button>
        </div>
      </div>

      <div className="rounded-md overflow-hidden" style={{ background: "#131722", border: "1px solid #2a2e39" }}>
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#787b86" }} />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: "#787b86" }}>
            {filter === "unread" ? "No unread items." : "No notifications yet."}
          </div>
        ) : (
          items.map((item) => {
            const color = severityColor(item.severity)
            const unread = !item.read_at
            const body = (
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: unread ? color : "#2a2e39" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "#d1d4dc" }}>{item.title}</div>
                    {item.body && <div className="text-sm mt-1" style={{ color: "#787b86" }}>{item.body}</div>}
                    <div className="text-[10px] mt-1" style={{ color: "#787b86" }}>{formatTime(item.created_at)}</div>
                  </div>
                </div>
              </div>
            )
            return (
              <div
                key={item.id}
                className={cn("flex items-start gap-3 px-4 py-3 border-b hover:bg-[#1e222d] transition-colors", unread && "bg-[#2962ff08]")}
                style={{ borderColor: "#2a2e39" }}
              >
                {item.action_url ? (
                  <Link href={item.action_url} onClick={() => unread && markRead(item.id)} className="flex-1 min-w-0">
                    {body}
                  </Link>
                ) : body}
                <div className="flex gap-1 shrink-0">
                  {unread && (
                    <button onClick={() => markRead(item.id)} className="p-1.5 rounded hover:bg-[#131722]" title="Mark as read">
                      <Check className="h-3.5 w-3.5" style={{ color: "#787b86" }} />
                    </button>
                  )}
                  <button onClick={() => remove(item.id)} className="p-1.5 rounded hover:bg-[#131722]" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" style={{ color: "#787b86" }} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

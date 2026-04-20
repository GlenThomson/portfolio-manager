"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import { Bell, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
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

const POLL_MS = 60000 // refresh every 60s

function severityColor(s: InboxItem["severity"]) {
  return s === "urgent" ? "#ef5350" : s === "warning" ? "#ff9500" : "#2962ff"
}

function relativeTime(iso: string): string {
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000
  if (diffSec < 60) return "just now"
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export function InboxWidget() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox?limit=20")
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchInbox()
    const interval = setInterval(fetchInbox, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchInbox])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)))
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
  }

  const markAllRead = async () => {
    setLoading(true)
    try {
      await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      })
      setUnreadCount(0)
      setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open inbox"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#ef5350] text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1 w-[360px] max-w-[90vw] rounded-md shadow-xl z-50 overflow-hidden"
          style={{ background: "#1e222d", border: "1px solid #2a2e39" }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#2a2e39" }}>
            <div className="text-sm font-medium" style={{ color: "#d1d4dc" }}>Inbox</div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-[11px] hover:underline"
                style={{ color: "#787b86" }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs" style={{ color: "#787b86" }}>
                No notifications yet.
              </div>
            ) : (
              items.map((item) => (
                <InboxRow key={item.id} item={item} onMarkRead={markRead} onClick={() => setOpen(false)} />
              ))
            )}
          </div>

          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className="block text-center py-2 text-xs border-t hover:bg-[#2a2e39] transition-colors"
            style={{ borderColor: "#2a2e39", color: "#787b86" }}
          >
            View all
          </Link>
        </div>
      )}
    </div>
  )
}

function InboxRow({ item, onMarkRead, onClick }: { item: InboxItem; onMarkRead: (id: string) => void; onClick: () => void }) {
  const color = severityColor(item.severity)
  const unread = !item.read_at

  const content = (
    <div
      className={cn("flex gap-2 px-3 py-2.5 border-b hover:bg-[#2a2e39] transition-colors", unread && "bg-[#2962ff08]")}
      style={{ borderColor: "#2a2e39" }}
      onClick={() => {
        if (unread) onMarkRead(item.id)
        onClick()
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: unread ? color : "#2a2e39" }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "#d1d4dc" }}>{item.title}</div>
        {item.body && <div className="text-xs mt-0.5" style={{ color: "#787b86" }}>{item.body}</div>}
        <div className="text-[10px] mt-1" style={{ color: "#787b86" }}>{relativeTime(item.created_at)}</div>
      </div>
      {unread && (
        <button
          onClick={(e) => { e.stopPropagation(); onMarkRead(item.id) }}
          className="shrink-0 self-start p-1 rounded hover:bg-[#131722]"
          title="Mark as read"
        >
          <Check className="h-3 w-3" style={{ color: "#787b86" }} />
        </button>
      )}
    </div>
  )

  if (item.action_url) {
    return <Link href={item.action_url}>{content}</Link>
  }
  return content
}

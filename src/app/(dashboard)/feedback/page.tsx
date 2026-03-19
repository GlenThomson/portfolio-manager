"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Bug, Lightbulb, Send, Loader2, Check, MessageSquare } from "lucide-react"

// ── Types ───────────────────────────────────────────────────

interface Issue {
  number: number
  title: string
  body: string
  state: string
  labels: string[]
  createdAt: string
  comments: number
}

type FeedbackType = "bug" | "feature"

// ── Component ───────────────────────────────────────────────

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("bug")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ issueUrl: string | null; issueNumber: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [loadingIssues, setLoadingIssues] = useState(true)

  // Fetch existing issues
  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Issue[]) => setIssues(data))
      .catch(() => {})
      .finally(() => setLoadingIssues(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    setSubmitted(null)

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to submit")
      }

      const data = await res.json()
      setSubmitted({ issueUrl: data.issueUrl, issueNumber: data.issueNumber })
      setTitle("")
      setDescription("")

      // Refresh issues list
      if (data.issueNumber) {
        fetch("/api/feedback")
          .then((r) => r.ok ? r.json() : [])
          .then((d: Issue[]) => setIssues(d))
          .catch(() => {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const bugs = issues.filter((i) => i.labels.includes("bug"))
  const features = issues.filter((i) => i.labels.includes("enhancement"))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback</h1>
        <p className="text-muted-foreground">Report bugs or request features</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* ── Submit Form ──────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submit Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type selector */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("bug")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1",
                    type === "bug"
                      ? "bg-red-500/15 text-red-500 border border-red-500/30"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Bug className="h-4 w-4" />
                  Bug Report
                </button>
                <button
                  type="button"
                  onClick={() => setType("feature")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1",
                    type === "feature"
                      ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Lightbulb className="h-4 w-4" />
                  Feature Request
                </button>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="title" className="text-sm font-medium">
                  {type === "bug" ? "What went wrong?" : "What would you like?"}
                </label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === "bug" ? "e.g. Portfolio page doesn't load" : "e.g. Add dark mode toggle"}
                  className="mt-1"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="text-sm font-medium">
                  Details {type === "bug" && <span className="text-muted-foreground font-normal">(steps to reproduce)</span>}
                </label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === "bug"
                      ? "1. Go to...\n2. Click on...\n3. Expected: ...\n4. Actual: ..."
                      : "Describe the feature and why it would be useful..."
                  }
                  className="mt-1 min-h-[120px]"
                />
              </div>

              {/* Submit */}
              <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : submitted ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {submitting ? "Submitting..." : submitted ? "Submitted!" : "Submit"}
              </Button>

              {/* Success message */}
              {submitted && (
                <div className="text-sm text-green-500 bg-green-500/10 rounded-md p-3">
                  Feedback submitted successfully! We&apos;ll look into it.
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </form>
          </CardContent>
        </Card>

        {/* ── Open Issues ──────────────────────────────────── */}
        <div className="space-y-4">
          {/* Bug Reports */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bug className="h-4 w-4 text-red-500" />
                Open Bugs
                <Badge variant="secondary" className="ml-auto">{bugs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingIssues ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : bugs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No open bugs</p>
              ) : (
                <div className="space-y-2">
                  {bugs.map((issue) => (
                    <IssueRow key={issue.number} issue={issue} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Requests */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                Feature Requests
                <Badge variant="secondary" className="ml-auto">{features.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingIssues ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : features.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No open feature requests</p>
              ) : (
                <div className="space-y-2">
                  {features.map((issue) => (
                    <IssueRow key={issue.number} issue={issue} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── Issue Row ───────────────────────────────────────────────

function IssueRow({ issue }: { issue: Issue }) {
  const title = issue.title.replace(/^\[(Bug|Feature)\]\s*/i, "")
  const date = new Date(issue.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })

  return (
    <div className="flex items-start gap-3 p-2 rounded-md">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{date}</span>
          {issue.comments > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> {issue.comments}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

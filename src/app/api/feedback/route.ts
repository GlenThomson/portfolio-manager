import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = "GlenThomson/portfolio-manager"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, title, description, page, screenshot } = body

    if (!title || !type) {
      return NextResponse.json({ error: "Title and type are required" }, { status: 400 })
    }

    const label = type === "bug" ? "bug" : "enhancement"
    const emoji = type === "bug" ? "🐛" : "✨"

    // Build issue body
    const sections = [
      `## ${emoji} ${type === "bug" ? "Bug Report" : "Feature Request"}`,
      "",
      description || "No description provided.",
      "",
      "---",
      `**Submitted by:** ${user.email}`,
      page ? `**Page:** \`${page}\`` : null,
      screenshot ? `**Screenshot:** ${screenshot}` : null,
      `**Date:** ${new Date().toISOString().split("T")[0]}`,
    ].filter(Boolean).join("\n")

    // Create GitHub Issue
    if (GITHUB_TOKEN) {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `[${type === "bug" ? "Bug" : "Feature"}] ${title}`,
          body: sections,
          labels: [label],
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error("GitHub API error:", err)
        return NextResponse.json({ error: "Failed to create issue" }, { status: 500 })
      }

      const issue = await res.json()
      return NextResponse.json({
        success: true,
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      })
    }

    // Fallback: no GitHub token configured
    console.log("Feedback received (no GITHUB_TOKEN):", { type, title, description })
    return NextResponse.json({ success: true, issueNumber: null, issueUrl: null })
  } catch (error) {
    console.error("Feedback error:", error)
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 })
  }
}

// GET: List open issues from GitHub
export async function GET() {
  if (!GITHUB_TOKEN) {
    return NextResponse.json([])
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&per_page=50&sort=created&direction=desc`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        next: { revalidate: 60 },
      }
    )

    if (!res.ok) return NextResponse.json([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issues = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped = issues.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((l: any) => l.name),
      createdAt: issue.created_at,
      url: issue.html_url,
      comments: issue.comments,
    }))

    return NextResponse.json(mapped, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch {
    return NextResponse.json([])
  }
}

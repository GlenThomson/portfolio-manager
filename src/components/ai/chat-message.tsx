"use client"

import { Bot, User, ChevronDown, ChevronRight, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"
import type { Message } from "ai"

// Simple markdown renderer — handles bold, italic, inline code, code blocks, lists, and headers
function renderMarkdown(text: string): React.ReactNode {
  // Split by code blocks first
  const segments = text.split(/(```[\s\S]*?```)/g)

  return segments.map((segment, i) => {
    // Code block
    if (segment.startsWith("```") && segment.endsWith("```")) {
      const lines = segment.slice(3, -3)
      const firstNewline = lines.indexOf("\n")
      const code = firstNewline >= 0 ? lines.slice(firstNewline + 1) : lines
      return (
        <pre
          key={i}
          className="my-2 p-3 rounded-md bg-background/60 border border-border overflow-x-auto text-xs"
        >
          <code>{code}</code>
        </pre>
      )
    }

    // Process inline content line by line
    const lines = segment.split("\n")
    return lines.map((line, j) => {
      const key = `${i}-${j}`

      // Empty line = paragraph break
      if (line.trim() === "") {
        return <br key={key} />
      }

      // Headers
      if (line.startsWith("### ")) {
        return (
          <h4 key={key} className="font-semibold text-sm mt-3 mb-1">
            {processInline(line.slice(4))}
          </h4>
        )
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={key} className="font-semibold text-base mt-3 mb-1">
            {processInline(line.slice(3))}
          </h3>
        )
      }
      if (line.startsWith("# ")) {
        return (
          <h2 key={key} className="font-bold text-base mt-3 mb-1">
            {processInline(line.slice(2))}
          </h2>
        )
      }

      // Unordered list items
      if (/^[\s]*[-*]\s/.test(line)) {
        const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0
        const content = line.replace(/^[\s]*[-*]\s/, "")
        return (
          <div key={key} className="flex gap-2" style={{ paddingLeft: `${indent * 8}px` }}>
            <span className="text-muted-foreground select-none">&#8226;</span>
            <span>{processInline(content)}</span>
          </div>
        )
      }

      // Ordered list items
      if (/^\s*\d+\.\s/.test(line)) {
        const match = line.match(/^(\s*)(\d+)\.\s(.*)/)
        if (match) {
          const indent = match[1].length
          const num = match[2]
          const content = match[3]
          return (
            <div key={key} className="flex gap-2" style={{ paddingLeft: `${indent * 8}px` }}>
              <span className="text-muted-foreground select-none min-w-[1.2em] text-right">
                {num}.
              </span>
              <span>{processInline(content)}</span>
            </div>
          )
        }
      }

      // Regular line
      return (
        <span key={key}>
          {processInline(line)}
          {j < lines.length - 1 && "\n"}
        </span>
      )
    })
  })
}

// Process inline markdown: bold, italic, inline code
function processInline(text: string): React.ReactNode {
  // Split by inline code first, then process bold/italic in non-code segments
  const parts = text.split(/(`[^`]+`)/g)

  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-background/60 border border-border text-xs font-mono"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    // Bold and italic
    let processed: string | React.ReactNode = part
    // Bold: **text**
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g)
    if (boldParts.length > 1) {
      processed = boldParts.map((bp, j) => {
        if (bp.startsWith("**") && bp.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold">
              {bp.slice(2, -2)}
            </strong>
          )
        }
        return bp
      })
      return <span key={i}>{processed}</span>
    }

    return part
  })
}

// Tool name to friendly description mapping
function getToolDescription(toolName: string, args: Record<string, unknown>): string {
  const symbol = (args?.symbol as string) ?? ""
  const query = (args?.query as string) ?? ""

  switch (toolName) {
    case "getQuote":
      return `Fetching quote for ${symbol}...`
    case "getPortfolio":
      return "Loading portfolio data..."
    case "getWatchlist":
      return "Loading watchlist..."
    case "analyzeStock":
      return `Analyzing ${symbol}...`
    case "searchStocks":
      return `Searching for "${query}"...`
    case "getPositionDetail":
      return `Loading position for ${symbol}...`
    case "getTechnicalAnalysis":
      return `Running technical analysis on ${symbol}...`
    case "getRedditSentiment":
      return `Checking Reddit sentiment for ${symbol || query}...`
    case "getSECFilings":
      return `Fetching SEC filings for ${symbol}...`
    case "getNews":
      return `Fetching news for ${symbol || query}...`
    default:
      return `Running ${toolName}...`
  }
}

// Format tool result values for display
function formatToolResult(result: unknown): React.ReactNode {
  if (result === null || result === undefined) return null

  if (typeof result === "object" && "error" in (result as Record<string, unknown>)) {
    return (
      <div className="text-destructive text-xs">
        {String((result as Record<string, unknown>).error)}
      </div>
    )
  }

  // Format as key-value pairs for objects
  if (typeof result === "object" && !Array.isArray(result)) {
    const entries = Object.entries(result as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined
    )
    return (
      <div className="space-y-1">
        {entries.slice(0, 20).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 text-xs">
            <span className="text-muted-foreground capitalize">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </span>
            <span className="font-mono text-right">
              {typeof value === "number"
                ? value.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                : typeof value === "object"
                  ? Array.isArray(value)
                    ? `${value.length} items`
                    : "{...}"
                  : String(value)}
            </span>
          </div>
        ))}
        {entries.length > 20 && (
          <div className="text-xs text-muted-foreground">
            ...and {entries.length - 20} more fields
          </div>
        )}
      </div>
    )
  }

  return <pre className="text-xs overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
}

interface ToolCallCardProps {
  toolName: string
  args: Record<string, unknown>
  state: string
  result?: unknown
}

function ToolCallCard({ toolName, args, state, result }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const description = getToolDescription(toolName, args)
  const isComplete = state === "result"

  return (
    <div className="my-2 rounded-md border border-border/60 bg-background/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/30 transition-colors"
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-muted-foreground flex-1 text-left">{description}</span>
        {isComplete && (
          <>
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </>
        )}
        {!isComplete && (
          <div className="flex gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </button>
      {expanded && isComplete && result ? (
        <div className="px-3 pb-2 border-t border-border/40 pt-2">
          {formatToolResult(result)}
        </div>
      ) : null}
    </div>
  )
}

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const toolInvocations = message.toolInvocations

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn("max-w-[80%] space-y-1", isUser && "flex flex-col items-end")}>
        {/* Tool invocation cards (assistant only) */}
        {!isUser && toolInvocations && toolInvocations.length > 0 && (
          <div className="w-full">
            {toolInvocations.map((tool) => (
              <ToolCallCard
                key={tool.toolCallId}
                toolName={tool.toolName}
                args={tool.args as Record<string, unknown>}
                state={tool.state}
                result={"result" in tool ? tool.result : undefined}
              />
            ))}
          </div>
        )}
        {/* Message content */}
        {message.content && (
          <div
            className={cn(
              "rounded-lg px-4 py-2.5",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            )}
          >
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="text-sm whitespace-pre-wrap leading-relaxed prose-sm">
                {renderMarkdown(message.content)}
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center mt-0.5">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  )
}

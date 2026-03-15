"use client"

import {
  Briefcase,
  TrendingUp,
  BarChart3,
  MessageSquare,
  Search,
  FileText,
} from "lucide-react"

const PROMPTS = [
  {
    text: "What's in my portfolio?",
    icon: Briefcase,
  },
  {
    text: "Analyze NVDA for me",
    icon: BarChart3,
  },
  {
    text: "What are the top gainers today?",
    icon: TrendingUp,
  },
  {
    text: "Check Reddit sentiment on TSLA",
    icon: MessageSquare,
  },
  {
    text: "Research AAPL — give me a full analysis",
    icon: Search,
  },
  {
    text: "What SEC filings has MSFT submitted recently?",
    icon: FileText,
  },
]

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void
}

export function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
      {PROMPTS.map((prompt) => {
        const Icon = prompt.icon
        return (
          <button
            key={prompt.text}
            className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-all duration-200 hover:border-primary/30 group"
            onClick={() => onSelect(prompt.text)}
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
              {prompt.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}

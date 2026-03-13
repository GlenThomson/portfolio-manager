"use client"

import { useChat } from "ai/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Bot, User, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRef, useEffect } from "react"

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: "/api/ai/chat",
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">AI Chat</h1>
        <p className="text-muted-foreground">
          Ask about stocks, your portfolio, or market analysis
        </p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">How can I help?</h3>
              <div className="grid gap-2 text-sm text-muted-foreground max-w-md">
                <button
                  className="p-3 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                  onClick={() => {
                    const fakeEvent = { target: { value: "What's the current price of AAPL?" } }
                    handleInputChange(fakeEvent as React.ChangeEvent<HTMLInputElement>)
                  }}
                >
                  &quot;What&apos;s the current price of AAPL?&quot;
                </button>
                <button
                  className="p-3 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                  onClick={() => {
                    const fakeEvent = { target: { value: "Compare MSFT and GOOGL" } }
                    handleInputChange(fakeEvent as React.ChangeEvent<HTMLInputElement>)
                  }}
                >
                  &quot;Compare MSFT and GOOGL&quot;
                </button>
                <button
                  className="p-3 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                  onClick={() => {
                    const fakeEvent = { target: { value: "Analyze NVDA's recent performance" } }
                    handleInputChange(fakeEvent as React.ChangeEvent<HTMLInputElement>)
                  }}
                >
                  &quot;Analyze NVDA&apos;s recent performance&quot;
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>

        <CardContent className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about a stock, your portfolio, or the market..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

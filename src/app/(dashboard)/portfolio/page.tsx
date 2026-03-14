"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Briefcase } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserId } from "@/lib/supabase/user"

interface Portfolio {
  id: string
  name: string
  currency: string
  is_paper: boolean
  created_at: string
}

interface PortfolioSummary {
  positionCount: number
  totalValue: number
  cashTotal: number
}

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [summaries, setSummaries] = useState<Record<string, PortfolioSummary>>({})
  const [newName, setNewName] = useState("")
  const [isPaper, setIsPaper] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPortfolios()
  }, [])

  async function fetchPortfolios() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    const portfolioList = data ?? []
    setPortfolios(portfolioList)

    // Fetch position summaries for each portfolio
    if (portfolioList.length > 0) {
      const ids = portfolioList.map((p) => p.id)
      const { data: positions } = await supabase
        .from("portfolio_positions")
        .select("portfolio_id, quantity, average_cost, asset_type")
        .in("portfolio_id", ids)
        .is("closed_at", null)

      const sums: Record<string, PortfolioSummary> = {}
      for (const p of portfolioList) {
        sums[p.id] = { positionCount: 0, totalValue: 0, cashTotal: 0 }
      }
      for (const pos of positions ?? []) {
        const s = sums[pos.portfolio_id]
        if (!s) continue
        if (pos.asset_type === "cash") {
          s.cashTotal += parseFloat(pos.average_cost)
        } else {
          s.positionCount++
          s.totalValue += parseFloat(pos.quantity) * parseFloat(pos.average_cost)
        }
      }
      setSummaries(sums)
    }

    setLoading(false)
  }

  async function createPortfolio(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return

    const supabase = createClient()
    const userId = await getCurrentUserId()

    const { error } = await supabase.from("portfolios").insert({
      user_id: userId,
      name: newName.trim(),
      currency: "USD",
      is_paper: isPaper,
    })

    if (!error) {
      setNewName("")
      setIsPaper(false)
      setDialogOpen(false)
      fetchPortfolios()
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolios</h1>
          <p className="text-muted-foreground">Manage your investment portfolios</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Portfolio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Portfolio</DialogTitle>
            </DialogHeader>
            <form onSubmit={createPortfolio} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. Growth Portfolio"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paper"
                  checked={isPaper}
                  onChange={(e) => setIsPaper(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="paper" className="text-sm">Paper trading (simulated)</label>
              </div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {portfolios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No portfolios yet</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Create your first portfolio to start tracking investments.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Track real or paper portfolios, record transactions, and monitor performance.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Portfolio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <Link key={portfolio.id} href={`/portfolio/${portfolio.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                    {portfolio.is_paper && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded">
                        Paper
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const s = summaries[portfolio.id]
                    const total = (s?.totalValue ?? 0) + (s?.cashTotal ?? 0)
                    return (
                      <>
                        <p className="text-2xl font-bold">${total.toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">
                          {s?.positionCount ?? 0} position{(s?.positionCount ?? 0) !== 1 ? "s" : ""}
                          {(s?.cashTotal ?? 0) > 0 && ` · $${s!.cashTotal.toFixed(2)} cash`}
                        </p>
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export default function PortfolioDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-28 mb-1" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Positions table skeleton */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {/* Table header */}
            <div className="flex items-center gap-4 px-4 py-3 border-b border-border">
              {["Symbol", "Qty", "Avg Cost", "Price", "Value", "P&L", "Day"].map((h) => (
                <Skeleton key={h} className="h-4 w-16 flex-1" />
              ))}
            </div>
            {/* Table rows */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Skeleton key={j} className="h-4 w-16 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

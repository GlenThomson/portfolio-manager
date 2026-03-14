import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function WatchlistLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>

      {/* Watchlist items */}
      <div className="grid gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 py-3 px-4">
              <div className="min-w-[100px] space-y-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden sm:block h-10 w-32" />
              <div className="ml-auto text-right space-y-1">
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-4 w-16 ml-auto" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

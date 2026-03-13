import { Card, CardContent } from "@/components/ui/card"
import { Bell } from "lucide-react"

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="text-muted-foreground">Price and technical alerts (coming in Phase 2)</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Bell className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">Alerts coming soon</h3>
          <p className="text-sm text-muted-foreground">
            Set price targets, RSI alerts, and volume spike notifications.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

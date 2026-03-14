import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Briefcase, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function PortfolioNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center text-center py-12 px-6">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Briefcase className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Portfolio not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            The portfolio you are looking for does not exist or you do not have
            access to it. It may have been deleted or the link may be incorrect.
          </p>
          <Link href="/portfolio">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Portfolios
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

export interface Portfolio {
  id: string
  userId: string
  name: string
  currency: string
  isPaper: boolean
  createdAt: string
  updatedAt: string
}

export interface Position {
  id: string
  portfolioId: string
  userId: string
  symbol: string
  quantity: number
  averageCost: number
  assetType: string
  openedAt: string
  closedAt: string | null
  currentPrice?: number
  marketValue?: number
  unrealizedPnl?: number
  unrealizedPnlPct?: number
  dayChange?: number
  dayChangePct?: number
}

export interface Transaction {
  id: string
  portfolioId: string
  userId: string
  symbol: string
  action: "buy" | "sell" | "dividend" | "split"
  quantity: number
  price: number
  fees: number
  brokerRef: string | null
  executedAt: string
  createdAt: string
}

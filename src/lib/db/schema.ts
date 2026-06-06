import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  boolean,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"

// ── Enums ──────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"])
export const assetTypeEnum = pgEnum("asset_type", ["stock", "etf", "crypto", "option", "bond", "other", "cash"])
export const transactionActionEnum = pgEnum("transaction_action", ["buy", "sell", "dividend", "split"])
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system"])
export const alertConditionEnum = pgEnum("alert_condition", ["above", "below", "pct_change"])
export const brokerEnum = pgEnum("broker", ["ibkr", "sharesies", "akahu"])
export const planStateEnum = pgEnum("plan_state", ["drafted", "active", "needs_attention", "closed", "invalidated"])
export const planReviewFrequencyEnum = pgEnum("plan_review_frequency", ["weekly", "monthly", "on_earnings", "on_event"])
export const inboxSeverityEnum = pgEnum("inbox_severity", ["info", "warning", "urgent"])

// ── User Profiles ──────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  displayName: text("display_name"),
  plan: planEnum("plan").default("free").notNull(),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ── Portfolios ─────────────────────────────────────────

export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  currency: text("currency").default("USD").notNull(),
  isPaper: boolean("is_paper").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const portfolioRelations = relations(portfolios, ({ many }) => ({
  positions: many(portfolioPositions),
  transactions: many(transactions),
}))

// ── Portfolio Positions ────────────────────────────────

export const portfolioPositions = pgTable("portfolio_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  symbol: text("symbol").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  averageCost: numeric("average_cost", { precision: 18, scale: 8 }).notNull(),
  assetType: assetTypeEnum("asset_type").default("stock").notNull(),
  source: text("source").default("unknown").notNull(),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const positionRelations = relations(portfolioPositions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [portfolioPositions.portfolioId],
    references: [portfolios.id],
  }),
}))

// ── Transactions ───────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  symbol: text("symbol").notNull(),
  action: transactionActionEnum("action").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  price: numeric("price", { precision: 18, scale: 8 }).notNull(),
  fees: numeric("fees", { precision: 18, scale: 4 }).default("0"),
  brokerRef: text("broker_ref"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const transactionRelations = relations(transactions, ({ one }) => ({
  portfolio: one(portfolios, {
    fields: [transactions.portfolioId],
    references: [portfolios.id],
  }),
}))

// ── Broker Connections ────────────────────────────────

export const brokerConnections = pgTable("broker_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  broker: brokerEnum("broker").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  accountId: text("account_id"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Watchlists ─────────────────────────────────────────

export const watchlists = pgTable("watchlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  symbols: text("symbols").array().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ── AI Chat ────────────────────────────────────────────

export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").default("New Chat"),
  context: jsonb("context").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const chatSessionRelations = relations(aiChatSessions, ({ many }) => ({
  messages: many(aiChatMessages),
}))

export const aiChatMessages = pgTable("ai_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => aiChatSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const chatMessageRelations = relations(aiChatMessages, ({ one }) => ({
  session: one(aiChatSessions, {
    fields: [aiChatMessages.sessionId],
    references: [aiChatSessions.id],
  }),
}))

// ── Alerts ─────────────────────────────────────────────

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  symbol: text("symbol").notNull(),
  conditionType: alertConditionEnum("condition_type").notNull(),
  conditionValue: numeric("condition_value", { precision: 18, scale: 8 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Market Data Cache (shared) ─────────────────────────

export const marketDataCache = pgTable("market_data_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  symbol: text("symbol").notNull(),
  dataType: text("data_type").notNull(),
  period: text("period").notNull(),
  data: jsonb("data").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Position Plans ─────────────────────────────────────

export const positionPlans = pgTable("position_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  symbol: text("symbol").notNull(),
  state: planStateEnum("state").default("drafted").notNull(),
  entryThesis: text("entry_thesis"),
  targetPrice: numeric("target_price", { precision: 18, scale: 4 }),
  targetEvent: text("target_event"),
  targetDate: timestamp("target_date", { mode: "date" }),
  stopPrice: numeric("stop_price", { precision: 18, scale: 4 }),
  stopCondition: text("stop_condition"),
  reviewFrequency: planReviewFrequencyEnum("review_frequency").default("monthly").notNull(),
  reviewNextDate: timestamp("review_next_date", { mode: "date" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// ── Inbox Items ────────────────────────────────────────

export const inboxItems = pgTable("inbox_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: text("type").notNull(),
  severity: inboxSeverityEnum("severity").default("info").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  symbol: text("symbol"),
  actionUrl: text("action_url"),
  metadata: jsonb("metadata").default({}),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Digest Runs ────────────────────────────────────────

export const digestRuns = pgTable("digest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  digestDate: timestamp("digest_date", { mode: "date" }).notNull(),
  content: jsonb("content").notNull(),
  emailSentAt: timestamp("email_sent_at"),
  emailError: text("email_error"),
  openedAt: timestamp("opened_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ── Risk Monitors ──────────────────────────────────────

export const riskMonitors = pgTable("risk_monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  keywords: text("keywords").array().default([]).notNull(),
  linkedTickers: text("linked_tickers").array().default([]).notNull(),
  hedgeTickers: text("hedge_tickers").array().default([]).notNull(),
  providers: jsonb("providers").default(["news"]).notNull(),
  alertOnLevel: numeric("alert_on_level"),
  alertOnChange: numeric("alert_on_change"),
  latestScore: numeric("latest_score"),
  latestScoreAt: timestamp("latest_score_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const riskScores = pgTable("risk_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitorId: uuid("monitor_id").notNull().references(() => riskMonitors.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  score: numeric("score").notNull(),
  components: jsonb("components"),
  headlines: jsonb("headlines"),
  summary: text("summary"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
})

// ── Polymarket ─────────────────────────────────────────

export const polymarketSettings = pgTable("polymarket_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique(),
  walletAddress: text("wallet_address"),
  scanEnabled: boolean("scan_enabled").default(true).notNull(),
  minVolumeUsd: numeric("min_volume_usd").default("5000").notNull(),
  minLiquidityUsd: numeric("min_liquidity_usd").default("1000").notNull(),
  minPositionUsd: numeric("min_position_usd").default("100").notNull(),
  maxEndDateDays: numeric("max_end_date_days").default("365").notNull(),
  minEndDateDays: numeric("min_end_date_days").default("5").notNull(),
  maxSpreadCents: numeric("max_spread_cents").default("0.04").notNull(),
  excludedCategories: text("excluded_categories").array().default(["Sports"]).notNull(),
  preferredCategories: text("preferred_categories").array().default([]).notNull(),
  notifyOnMatch: boolean("notify_on_match").default(false).notNull(),
  minAiScore: numeric("min_ai_score").default("60").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const polymarketScanResults = pgTable("polymarket_scan_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  scanDate: timestamp("scan_date", { mode: "date" }).notNull(),
  marketId: text("market_id").notNull(),
  slug: text("slug"),
  question: text("question").notNull(),
  category: text("category"),
  yesPrice: numeric("yes_price"),
  noPrice: numeric("no_price"),
  volume24h: numeric("volume_24h"),
  liquidity: numeric("liquidity"),
  endDate: timestamp("end_date"),
  marketUrl: text("market_url"),
  aiScore: numeric("ai_score").default("0").notNull(),
  aiConfidence: numeric("ai_confidence"),
  aiThesis: text("ai_thesis"),
  aiSuggestedSide: text("ai_suggested_side"),
  aiEdgePct: numeric("ai_edge_pct"),
  aiConcerns: text("ai_concerns"),
  rawMarket: jsonb("raw_market"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const polymarketUserBets = pgTable("polymarket_user_bets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  marketId: text("market_id").notNull(),
  question: text("question"),
  side: text("side").notNull(),
  shares: numeric("shares").notNull(),
  avgPriceUsd: numeric("avg_price_usd").notNull(),
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
  exitedAt: timestamp("exited_at"),
  exitPrice: numeric("exit_price"),
  pnlUsd: numeric("pnl_usd"),
  source: text("source").default("manual").notNull(),
  thesis: text("thesis"),
  notes: text("notes"),
  resolved: boolean("resolved").default(false).notNull(),
  resolutionOutcome: text("resolution_outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const polymarketWatchlist = pgTable("polymarket_watchlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  marketId: text("market_id").notNull(),
  question: text("question"),
  marketUrl: text("market_url"),
  userEstimatePct: numeric("user_estimate_pct"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

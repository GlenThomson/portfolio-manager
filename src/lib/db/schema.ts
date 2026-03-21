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

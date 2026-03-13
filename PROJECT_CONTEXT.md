# PortfolioAI — Project Context

## Vision

An AI-powered portfolio manager and investment assistant that combines real-time market data, technical analysis, earnings/SEC filing intelligence, social sentiment, and an AI chat interface into a single platform. Designed to grow from a personal tool into a multi-user SaaS.

---

## Prerequisites (before any coding)

1. **Upgrade Node.js to v22 LTS** — Current v18.12.1 is below Next.js 14's minimum (18.17.0). Download from https://nodejs.org
2. **Create a Supabase project** — Go to https://supabase.com, create a new project, get the URL, anon key, and service role key
3. **Get an Anthropic API key** — Since user has Claude Max, use Claude as the primary AI. Get key from https://console.anthropic.com

---

## Core Features (full roadmap)

### Portfolio Management
- Manual portfolio entry (buy/sell transactions)
- Brokerage sync via API (Alpaca, Tradier, IBKR — Phase 4)
- Real-time position valuation with unrealised P&L
- Transaction history and cost basis tracking (FIFO/LIFO/specific lot)
- Dividend tracking and income summary
- Paper trading mode (no real money risk)
- Portfolio stress testing ("what if S&P drops 20%?")
- Investment thesis journaling per position — AI periodically re-evaluates
- Correlation matrix — how positions move relative to each other

### Market Data & Charts
- Interactive candlestick charts (TradingView Lightweight Charts)
- Technical indicators: 200/50 DMA, RSI(14), MACD(12,26,9), Bollinger Bands, Volume, VWAP
- AI selects which indicators are most relevant per stock/context
- Watchlists with mini sparklines and live quotes
- Sector/macro context layer (sector ETF performance alongside individual stocks)
- Market status indicator (open/closed/pre-market/after-hours with countdown)
- Stock detail page: chart + fundamentals + news + sentiment in one view

### AI Intelligence
- Chat interface: natural language → actions ("Research Moderna and report back")
- **Primary AI: Anthropic Claude** (via Vercel AI SDK with @ai-sdk/anthropic)
- Autonomous research agent: fetches fundamentals + 10-K + sentiment + chart → produces structured investment thesis
- Portfolio analysis and rebalancing recommendations
- Explainable outputs: every recommendation cites specific data sources
- AI re-evaluates position theses when new data arrives

### Market Intelligence
- Earnings report reading and AI summarisation
- SEC EDGAR 10-K/10-Q/8-K filing analysis (Claude handles long context — 200k tokens)
- Earnings calendar with beat/miss history (earnings whisper tracking)
- Market anomaly detection: price/volume Z-score outliers (e.g. oil up 100% in a week)
- Social sentiment: StockTwits → Twitter/X API
- Options flow surface (Unusual Whales — Phase 3+)
- Financial news aggregation for watchlist stocks

### Alerts & Notifications
- Price target alerts (above/below)
- Technical alerts (RSI overbought/oversold, volume spikes)
- Market anomaly alerts
- Email + in-app + push (PWA)

### SaaS / Multi-user (Phase 5)
- Subscription tiers: Free (1 portfolio, 5 watchlist, 10 AI queries/day) / Pro $19/mo (unlimited) / Enterprise
- Stripe billing
- Row Level Security on all user data — users can never see each other's data
- API key management per user for brokerage connections
- Public landing page + onboarding wizard
- Admin dashboard (user count, revenue, API cost per user)

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 App Router + TypeScript | Full-stack, streaming, RSC |
| Styling | Tailwind CSS + shadcn/ui | Fast, composable, accessible |
| Database | PostgreSQL via Supabase | RLS for multi-tenancy, free tier |
| ORM | Drizzle ORM | Lightweight, type-safe, plain SQL migrations |
| Auth | Supabase Auth + @supabase/ssr | Integrates with RLS natively |
| AI (primary) | Vercel AI SDK + **Anthropic Claude** | User has Max sub, best for financial analysis |
| AI (fallback) | OpenAI GPT-4o | If needed for specific tasks |
| Charts | TradingView Lightweight Charts | Industry standard, open source |
| Background jobs | Upstash QStash (Phase 2+) | Serverless queue, no persistent worker |
| Caching (Phase 1) | Next.js API route cache + in-memory Map | Simple, no external deps |
| Caching (Phase 2+) | Upstash Redis | Price data TTL, AI deduplication |
| State | TanStack Query + Zustand | Server state + UI state |
| Market data (Phase 1) | yahoo-finance2 | Free, good enough for dev |
| Market data (Phase 2+) | Alpha Vantage / Polygon.io | Reliable, higher rate limits |
| Sentiment | StockTwits API (free) → Twitter/X Basic | Free start |
| SEC filings | SEC EDGAR API | Free, no key required |
| Email | Resend (Phase 2+) | 3k/mo free tier |
| Hosting | Vercel | Native Next.js, edge functions |

---

## Phase Roadmap

### Phase 1 — Foundation: "See Your Portfolio"
**Goal**: User can sign up, add a portfolio manually, see live charts with indicators, manage a watchlist, and chat with an AI that knows their holdings.

**Prerequisites**:
- Upgrade Node.js to v22 LTS
- Create Supabase project + get keys
- Get Anthropic API key

**Key deliverables**:
- Supabase auth (email + Google OAuth)
- Dashboard layout shell (sidebar + topnav, dark theme)
- Stock detail page with interactive candlestick chart (200/50 DMA overlay)
- RSI + MACD indicator panes
- Watchlist with live quotes + sparklines
- Manual portfolio entry with positions table + transactions
- Portfolio summary (total value, P&L, day change)
- AI chat (portfolio-aware, streaming, can look up prices and positions)
- Market status indicator (open/closed/pre-market/after-hours)

**Does NOT include** (deferred to keep Phase 1 lean):
- Background job queue (Upstash QStash)
- Redis caching (use simple in-memory cache)
- Email notifications
- SEC filing analysis
- Sentiment analysis

### Phase 2 — Market Intelligence: "Know the Market"
- SEC EDGAR filing reader with AI summaries
- Earnings calendar + beat/miss history
- StockTwits + Reddit sentiment
- Market anomaly detection (Z-score outliers)
- Upstash Redis for caching + QStash for background jobs
- Email alerts via Resend
- News aggregation for watchlist stocks

### Phase 3 — AI Analyst: "Your Research Analyst"
- Autonomous research agent (queued background jobs)
- Twitter/X account monitoring
- Portfolio position scoring (nightly)
- Structured research report UI
- Options flow (Unusual Whales)
- Investment thesis journaling + AI re-evaluation
- Stock screener (filter by technical/fundamental criteria)

### Phase 4 — Brokerage Integration: "Take Action"
- Alpaca Markets API (paper + live trading)
- Tradier API
- Portfolio auto-sync from brokerage
- AI-driven trade execution (with explicit confirmation step)
- Brokerage webhooks for real-time fills
- Tax lot tracking (FIFO/LIFO/specific identification)

### Phase 5 — SaaS: "Ship It"
- Stripe subscription billing
- Usage limits per plan tier
- Public marketing pages
- User onboarding wizard
- Admin dashboard

---

## Database Schema (Drizzle)

### User-owned tables (all have `user_id FK + RLS policy`)
- **users_profiles** — display_name, plan enum (free/pro/enterprise), settings jsonb
- **portfolios** — name, currency, is_paper bool
- **portfolio_positions** — symbol, quantity, average_cost, asset_type enum, opened_at/closed_at
- **transactions** — action enum (buy/sell/dividend/split), quantity, price, fees, broker_ref
- **watchlists** — name, symbols text[]
- **brokerage_connections** — broker enum, encrypted tokens, scopes, last_synced_at (Phase 4)
- **ai_research_tasks** — task_type enum, input_params jsonb, status enum, result jsonb, tokens_used
- **ai_chat_sessions** — title, context jsonb (portfolio snapshot)
- **ai_chat_messages** — role enum, content, tool_calls jsonb
- **alerts** — symbol, condition_type enum, condition_value, triggered_at

### Shared tables (no RLS — read by all users)
- **market_data_cache** — PK(symbol, data_type, period), data jsonb, expires_at
- **sentiment_snapshots** — symbol, source enum, bullish/bearish scores, message_volume (Phase 2)
- **sec_filing_index** — symbol, cik, filing_type, filing_date, document_url, ai_summary (Phase 2)

---

## Directory Structure

```
src/
  app/
    (auth)/login, signup, api/auth/callback
    (dashboard)/
      layout.tsx                    — Sidebar + TopNav shell
      page.tsx                      — Dashboard home
      portfolio/[id]/page.tsx       — Portfolio positions + summary
      watchlist/page.tsx            — Watchlists + live quotes
      stock/[symbol]/page.tsx       — Stock detail: chart + fundamentals + news
      chat/page.tsx                 — AI chat interface
      research/page.tsx             — AI research tasks (Phase 3)
      alerts/page.tsx               — Alert management (Phase 2)
      settings/page.tsx             — User settings
      settings/connections/page.tsx — Brokerage connections (Phase 4)
    api/
      market/quote, chart, indicators, search
      portfolio/[id]/
      watchlist/[id]/
      ai/chat, research/[taskId]
      webhooks/qstash, brokerage   — Phase 2+
      sec/filings                  — Phase 2
  components/
    ui/                   — shadcn/ui base components
    charts/               — StockChart, IndicatorPane, MiniSparkline
    portfolio/            — PositionsTable, AddPositionModal, PerformanceChart, PortfolioSummaryCard
    watchlist/            — WatchlistRow
    ai/                   — ChatInterface, ChatMessage, ResearchTaskCard
    market/               — QuoteHeader, MarketStatus, FundamentalsGrid
    layout/               — Sidebar, TopNav, MobileNav
  lib/
    supabase/client.ts, server.ts
    db/schema.ts, index.ts, queries/
    market/yahooFinance.ts, indicators.ts
    market/edgar.ts, stocktwits.ts  — Phase 2+
    ai/tools.ts, systemPrompt.ts, researchAgent.ts
    jobs/qstash.ts, processors/    — Phase 2+
    utils/formatters.ts, validators.ts, cache.ts
  hooks/
    usePortfolio.ts, useMarketData.ts, useAIChat.ts, useWatchlist.ts
  types/
    market.ts, portfolio.ts, ai.ts
  providers/
    query-provider.tsx             — TanStack Query provider
  middleware.ts
```

---

## Key Third-Party Services

| Service | Purpose | Free Tier | When Needed |
|---|---|---|---|
| Supabase | DB, Auth, Realtime | 500MB DB, 50k MAU | Phase 1 |
| Anthropic Claude | Primary AI | Pay per use (or Max sub) | Phase 1 |
| yahoo-finance2 | Stock quotes + history | Unofficial, free | Phase 1 |
| Alpha Vantage | Reliable quotes, technicals | 25 req/day | Phase 2 |
| Polygon.io | Historical OHLCV | Unlimited 15-min delayed | Phase 2+ |
| SEC EDGAR | Filings | Free, no key | Phase 2 |
| StockTwits | Social sentiment | Free public API | Phase 2 |
| Upstash QStash | Job queue | 500 msg/day | Phase 2 |
| Upstash Redis | Caching | 10k cmd/day | Phase 2 |
| Resend | Email | 3k/mo | Phase 2 |
| Vercel | Hosting | Hobby tier | Phase 1 |
| OpenAI | Fallback AI | Pay per use | If needed |

---

## Suggested Additions (beyond original vision)

1. **Investment thesis journaling** — attach a thesis to every position; AI re-evaluates periodically
2. **Backtesting engine** — test strategies against historical data
3. **Sector/macro context** — sector ETF performance alongside individual stocks
4. **Earnings whisper tracking** — historical beat/miss delta vs estimates
5. **Options flow alerts** — unusual options activity via Unusual Whales API
6. **Mobile PWA** — installable on iOS/Android from day one
7. **Portfolio stress testing** — simulate market scenarios
8. **Explainable AI** — every recommendation cites sources (RSI value, 10-Q excerpt, sentiment score)
9. **Dividend tracking** — income summary, yield tracking, ex-dividend alerts
10. **Tax lot tracking** — FIFO/LIFO/specific identification for tax-efficient selling
11. **Correlation matrix** — visualise how positions move relative to each other
12. **Stock screener** — filter universe by technical + fundamental criteria
13. **Market status indicator** — open/closed/pre-market/after-hours with countdown timer

---

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI (Claude is primary)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=           # optional fallback

# Market Data
ALPHA_VANTAGE_API_KEY=    # Phase 2+

# Database (Supabase connection pooler)
DATABASE_URL=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Note: Phase 1 only needs Supabase keys + Anthropic API key + DATABASE_URL. Other keys are added as features require them.

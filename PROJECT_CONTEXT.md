# PortfolioAI — Project Context

## Vision

An **AI-first** investment intelligence platform. The core value proposition is an AI that can ingest vast amounts of data — news, SEC filings, technical indicators, social sentiment, market anomalies — and reason about it to help find and make investment decisions. The portfolio tracker is the foundation; the AI analyst is the product.

**Core principle**: The AI should be able to autonomously research opportunities, monitor the market, and surface actionable insights — not just answer questions about positions the user already holds.

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

### AI Intelligence (Core Product)
- Chat interface: natural language → actions ("Research Moderna and report back")
- **Primary AI: Groq (Llama 3.3 70B)** for dev, **Anthropic Claude** for production
- **AI Tools**: getQuote, getPortfolio, getWatchlist, analyzeStock, searchStocks, getPositionDetail, getTechnicals, getNews, analyzeSentiment, getFilings, readFiling, scanMarket, deepResearch
- **Autonomous research agent**: user says "Research NVDA" → AI chains tools (quote → fundamentals → technicals → news → filings → sentiment) → produces structured investment thesis with bull/bear case
- **Market scanner**: AI scans for unusual volume/price moves, screens by criteria, finds opportunities
- **Technical analysis reasoning**: AI reads RSI, MACD, SMA/EMA, Bollinger Bands and explains what they mean for a stock
- Portfolio analysis and rebalancing recommendations
- Explainable outputs: every recommendation cites specific data sources (RSI value, 10-Q excerpt, sentiment score)
- AI re-evaluates position theses when new data arrives

### Market Intelligence
- **Finnhub integration**: Real-time news, sentiment scores, earnings calendar (free, 60 req/min)
- **SEC EDGAR**: 10-K/10-Q/8-K filing reader with AI summaries (free, no key)
- **Reddit sentiment**: r/wallstreetbets and r/stocks mention tracking via Tradestie/ApeWisdom (free)
- Market anomaly detection: price/volume Z-score outliers (e.g. oil up 100% in a week)
- Earnings calendar with beat/miss history
- News aggregation for watchlist stocks
- Twitter/X monitoring (future — requires $200/mo API)

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
| Finnhub | News, sentiment, earnings | 60 req/min free | Phase 2 |
| Reddit (Tradestie) | r/WSB top 50 sentiment | 20 req/min free | Phase 2 |
| Reddit (ApeWisdom) | Mention tracking | Free | Phase 2 |
| SEC filings | SEC EDGAR API | Free, no key required |
| Email | Resend (Phase 2+) | 3k/mo free tier |
| Hosting | Vercel | Native Next.js, edge functions |

---

## Phase Roadmap

### Phase 1 — Foundation: "See Your Portfolio" ✅ COMPLETE
**Goal**: User can sign up, add a portfolio manually, see live charts with indicators, manage a watchlist, and chat with an AI that knows their holdings.

**Delivered**:
- ✅ Supabase auth (email + Google OAuth) with middleware protection
- ✅ Dashboard layout shell (sidebar + topnav, dark theme)
- ✅ Stock detail page with interactive candlestick chart (SMA/EMA/BB overlays)
- ✅ RSI + MACD indicator panes, log scale toggle
- ✅ Watchlist with live quotes + sparklines
- ✅ Manual portfolio entry with positions table + transactions
- ✅ CSV import from brokers (Sharesies, IBKR, generic) with cash column detection
- ✅ Portfolio summary (total value, P&L, day change, best/worst performers)
- ✅ AI chat with 6 tools (getQuote, getPortfolio, getWatchlist, analyzeStock, searchStocks, getPositionDetail)
- ✅ Market status indicator (US NYSE + NZ NZX with holiday support and countdown)
- ✅ Price alerts with chart right-click creation, draggable lines, email notifications via Resend
- ✅ Settings page (profile, appearance/theme, currency, alert preferences)
- ✅ Stock fundamentals grid (10 metrics) + news section
- ✅ Dashboard allocation pie chart, recent transactions, top movers
- ✅ Portfolio position detail expansion, CSV export, transaction filtering
- ✅ Dividend tracking with income page and monthly chart
- ✅ Stock comparison page with normalized chart and metrics table
- ✅ Loading skeletons, error boundaries, mobile responsiveness, not-found pages
- ✅ Row Level Security on all tables
- ✅ Real-time chart polling for intraday timeframes
- ✅ Intraday candle data filtering (zero-volume, date range clamping)

### Phase 2 — AI Intelligence: "Your AI Analyst" ⬅️ IN PROGRESS
**Goal**: AI can autonomously research stocks, read filings, analyze sentiment, scan for opportunities, and produce structured investment theses.

- AI technical analysis tool (RSI, MACD, SMA/EMA, Bollinger values as data for AI reasoning)
- Finnhub news integration + AI sentiment scoring
- SEC EDGAR filing reader with AI summaries
- Market scanner (unusual volume/price moves, sector screening)
- Deep research agent (chains all tools → structured thesis)
- Reddit sentiment (r/wallstreetbets, r/stocks mention tracking)
- Earnings calendar + beat/miss history
- Improved AI chat UI (tool result cards, research report formatting, suggested prompts)
- Currency conversion across all pages
- Sharesies CSV auto-detection (fix $0 average costs)

### Phase 3 — Advanced Intelligence: "Market Edge"
- Twitter/X account monitoring (when API budget allows)
- Portfolio position scoring (scheduled)
- Investment thesis journaling + AI re-evaluation
- Stock screener (filter by technical/fundamental criteria)
- Options flow (Unusual Whales)
- Upstash Redis for caching + QStash for background jobs
- Background alert checking (currently manual/poll-based)

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
GROQ_API_KEY=             # Free — Llama 3.3 70B for dev
FINNHUB_API_KEY=          # Free — news, sentiment, earnings
ALPHA_VANTAGE_API_KEY=    # Phase 2+

# Database (Supabase connection pooler)
DATABASE_URL=

# Email (Resend — alert notifications)
RESEND_API_KEY=
RESEND_FROM_EMAIL=        # defaults to onboarding@resend.dev

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Note: Phase 1 needs Supabase keys + ANTHROPIC_API_KEY + DATABASE_URL + RESEND_API_KEY (for alert emails). Other keys added as features require them.

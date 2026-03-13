# PortfolioAI — Progress Tracker

## Current Phase: Phase 1 — Foundation: "See Your Portfolio"

---

## Completed

### Project Setup
- [x] Created Next.js 14 app (initial scaffold)
- [x] Wrote PROJECT_CONTEXT.md (full spec)
- [x] Created .env.local with all keys
- [x] Supabase live project created + connected
- [x] Upgraded Node.js (v24.14.0)

### Infrastructure
- [x] Core dependencies installed (shadcn/ui, Drizzle, Supabase, TanStack Query, Zustand, AI SDK, TradingView charts, yahoo-finance2)
- [x] shadcn/ui initialized (dark theme, slate palette, 13 UI components)
- [x] Supabase client (browser + server + middleware for auth refresh)
- [x] Drizzle ORM + full schema (user_profiles, portfolios, positions, transactions, watchlists, ai_chat_sessions, ai_chat_messages, alerts, market_data_cache)
- [x] Schema pushed to Supabase (all tables live)
- [x] TanStack Query provider

### Auth
- [x] Login page (email/password + Google OAuth)
- [x] Signup page with email confirmation flow
- [x] Auth callback route for OAuth
- [x] Middleware for session refresh

### Layout & Navigation
- [x] Dashboard layout shell (sidebar + topnav, dark theme)
- [x] Mobile navigation (sheet-based sidebar)
- [x] Dashboard home page with summary cards
- [x] Functional stock search bar (navigates to /stock/[symbol])
- [x] Market status indicator (open/closed/pre-market/after-hours with countdown)

### Portfolio
- [x] Portfolio list page (create new portfolios, paper trading toggle)
- [x] Portfolio detail page with positions table
- [x] Add transaction dialog (buy/sell with quantity + price)
- [x] Position tracking (average cost, quantity, P&L calculation)
- [x] Live market value + unrealized P&L via quote API
- [x] Portfolio summary cards (market value, total P&L, position count)

### Market Data & Charts
- [x] Stock detail page (/stock/[symbol])
- [x] Interactive candlestick chart with volume overlay
- [x] SMA 50 + SMA 200 overlays
- [x] RSI(14) indicator pane with overbought/oversold levels
- [x] MACD(12,26,9) indicator pane with signal line + histogram
- [x] Period selector (1D, 5D, 1M, 3M, 6M, 1Y, 2Y)
- [x] Toggle RSI/MACD visibility
- [x] Synced time scales across all chart panes
- [x] Quote header with price, change, day range, 52W range, market cap
- [x] Market data API routes (quote, chart, search) via yahoo-finance2

### Watchlist
- [x] Watchlist page with add/remove symbols
- [x] Live quotes per symbol
- [x] Mini sparkline charts (5-day)
- [x] Click-through to stock detail page

### AI Chat
- [x] Chat interface with streaming responses
- [x] AI system prompt for investment analysis
- [x] getQuote tool (AI can look up live stock prices)
- [x] Suggestion prompts for new conversations
- [x] Message display with user/assistant styling

### Verified Working
- [x] Build compiles clean (no errors)
- [x] Dev server runs on localhost:3000
- [x] All pages return 200
- [x] Stock quote API returns live data (tested: AAPL $255.76)
- [x] Chart API returns OHLCV data
- [x] Search API returns matching symbols

---

## Not Started (Phase 1 Remaining)
- [ ] Set up RLS policies on Supabase tables
- [ ] Protect dashboard routes (redirect unauthenticated users to /login)

---

## Future Phases (not started)
- Phase 2: Market Intelligence (SEC filings, earnings, sentiment, alerts)
- Phase 3: AI Analyst (research agent, scoring, screener)
- Phase 4: Brokerage Integration (Alpaca, Tradier, live trading)
- Phase 5: SaaS (Stripe, multi-user, landing page)

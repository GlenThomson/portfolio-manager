# PortfolioAI

AI-powered portfolio management app for NZ-based investors. Built by a solo developer.

## Stack

- **Framework**: Next.js 14 (App Router), TypeScript
- **Database**: Supabase PostgreSQL + Drizzle ORM
- **Auth**: Supabase Auth (OAuth + email/password)
- **UI**: Tailwind CSS, Radix UI (shadcn/ui), Lucide icons
- **Charts**: lightweight-charts (TradingView-style)
- **AI**: Vercel AI SDK with Anthropic/Groq/Gemini
- **State**: TanStack React Query (server), Zustand (client), Context (currency)
- **Deploy**: Vercel
- **Email**: Resend

## Commands

- `npm run dev` — local dev server (port 3000)
- `npm run build` — production build
- `npm run db:generate` — generate Drizzle migrations
- `npm run db:migrate` — run pending migrations
- `npm run db:push` — push schema changes directly

## Workflow Rules

- **Never push to main** unless explicitly told to. Always create a feature/fix branch first.
- Wait for the user to test changes before merging or pushing to main.
- When told to merge: merge branch to main, push, then verify Vercel deployment succeeds.
- Keep commits focused — one logical change per commit.
- Remove debug endpoints and console.logs before pushing to production.

## Code Patterns

### Authentication
- Server-side: `const userId = await getServerUserId()` — throws 401 if unauthenticated
- Client-side: `const supabase = createClient()` then `supabase.auth.getUser()`
- Every API route MUST call `getServerUserId()` before processing

### Database
- All queries use Drizzle ORM — never write raw SQL strings
- Schema defined in `src/lib/db/schema.ts` — use generated types, don't create duplicates
- Use `eq()`, `and()`, `or()` for WHERE clauses
- Migrations live in `migrations/`

### API Routes
- Located in `src/app/api/*/route.ts`
- Return `NextResponse.json()` with appropriate status codes
- Validate inputs with Zod or `isValidSymbol()` from `src/lib/validation.ts`
- Add `export const maxDuration = 30` for routes calling external APIs
- Handle errors with try/catch, return meaningful error messages

### Components
- UI primitives in `src/components/ui/` (shadcn/ui — don't modify these)
- Use `cn()` from `src/lib/utils.ts` for className merging
- Use Tailwind classes, avoid inline styles unless SVG/canvas
- Use toasts for notifications — never `alert()` or confirmation modals

### Data Fetching
- Client-side: TanStack React Query with 2-10 min stale times
- Check for existing hooks in `src/hooks/` before creating new ones
- Check for existing market helpers in `src/lib/market/` before adding API calls

## Security Rules

- Validate all user input before database operations
- Use `isValidSymbol()` for any stock symbol from user/URL params
- Never log PII (emails, tokens, passwords, API keys)
- Never commit `.env.local` or expose secrets in client-side code
- Auth callback must validate redirect paths (prevent open redirects)
- File uploads: enforce size limits (10MB max for CSV imports)
- Sanitize all data before rendering (React handles most XSS, but be careful with `dangerouslySetInnerHTML`)

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, signup (public)
│   ├── (dashboard)/     # Protected pages (dashboard, portfolio, stock, markets, etc.)
│   └── api/             # API routes
│       ├── ai/chat/     # AI streaming chat with 40+ tools
│       ├── brokers/     # Akahu, IBKR, CSV import
│       ├── market/      # Yahoo Finance, Finnhub, EDGAR, FRED, CBOE
│       └── portfolio/   # Portfolio CRUD and health analysis
├── components/
│   ├── ui/              # shadcn/ui primitives (don't modify)
│   ├── charts/          # Stock charts, drawing tools
│   ├── portfolio/       # Portfolio management components
│   └── layout/          # Sidebar, topnav, search
├── lib/
│   ├── db/              # Drizzle schema and client
│   ├── supabase/        # Auth helpers (client.ts, server.ts)
│   ├── market/          # Market data integrations
│   ├── scoring/         # Stock scoring (technical, fundamental, sentiment)
│   ├── optimization/    # HRP, Kelly criterion, regime detection
│   ├── brokers/         # Broker connections and ticker resolution
│   └── validation.ts    # Shared input validators
├── hooks/               # React Query hooks
├── providers/           # QueryProvider, CurrencyProvider
└── types/               # Shared TypeScript types
```

## Key Integrations

| Service | Purpose | Config |
|---------|---------|--------|
| Yahoo Finance | Quotes, charts, options, fundamentals | No key needed |
| Finnhub | News, earnings, insider trading, analyst ratings | `FINNHUB_API_KEY` |
| FRED | Macro data (yield curve, CPI, unemployment) | `FRED_API_KEY` |
| Akahu | NZ Open Banking (Sharesies sync) | `AKAHU_APP_TOKEN`, `AKAHU_USER_TOKEN` |
| CNN | Fear & Greed Index | No key needed |
| EDGAR | SEC filings | No key needed |
| Resend | Email alerts | `RESEND_API_KEY` |

## Build Notes

- TypeScript type checking and ESLint are skipped during Vercel builds (OOM on 2-core build machines)
- Types and lint are checked by the IDE during development
- The `lucide-react` package has massive type definitions that cause the OOM — this is a known issue
- Dev server should be run with `NODE_OPTIONS="--max-old-space-size=4096"` on memory-constrained machines

## UI Preferences

- Support multiple themes (dark, light, and custom) — don't hardcode a single theme
- Use subtle feedback — toasts, inline messages — never modal popups for confirmations
- Match UI weight to action severity — don't over-style simple actions
- Keep layouts clean and uncluttered
- Charts should fill available space (use `preserveAspectRatio="none"` with HTML labels for axes)

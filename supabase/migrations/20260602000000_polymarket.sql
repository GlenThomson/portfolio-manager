-- Polymarket workspace tables.
-- - polymarket_settings: per-user filters + wallet address
-- - polymarket_scan_results: daily snapshot of AI-scored markets
-- - polymarket_user_bets: tracked bets (from wallet sync or manual entry)
-- - polymarket_watchlist: markets the user pinned

CREATE TABLE IF NOT EXISTS polymarket_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  wallet_address TEXT,
  scan_enabled BOOLEAN NOT NULL DEFAULT true,
  min_volume_usd NUMERIC NOT NULL DEFAULT 5000,
  min_liquidity_usd NUMERIC NOT NULL DEFAULT 1000,
  min_position_usd NUMERIC NOT NULL DEFAULT 100,
  max_end_date_days INTEGER NOT NULL DEFAULT 365,
  min_end_date_days INTEGER NOT NULL DEFAULT 5,
  max_spread_cents NUMERIC NOT NULL DEFAULT 0.04,
  excluded_categories TEXT[] NOT NULL DEFAULT ARRAY['Sports'],
  preferred_categories TEXT[] NOT NULL DEFAULT '{}',
  notify_on_match BOOLEAN NOT NULL DEFAULT false,
  min_ai_score INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE polymarket_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own polymarket settings" ON polymarket_settings FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own polymarket settings" ON polymarket_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own polymarket settings" ON polymarket_settings FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS polymarket_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scan_date DATE NOT NULL,
  market_id TEXT NOT NULL,
  slug TEXT,
  question TEXT NOT NULL,
  category TEXT,
  yes_price NUMERIC,
  no_price NUMERIC,
  volume_24h NUMERIC,
  liquidity NUMERIC,
  end_date TIMESTAMPTZ,
  market_url TEXT,
  ai_score INTEGER NOT NULL DEFAULT 0,
  ai_confidence INTEGER,
  ai_thesis TEXT,
  ai_suggested_side TEXT,            -- 'yes' | 'no' | null
  ai_edge_pct NUMERIC,               -- AI fair probability - market price, in pp
  ai_concerns TEXT,
  raw_market JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, scan_date, market_id)
);

CREATE INDEX IF NOT EXISTS idx_polymarket_scan_user_date
  ON polymarket_scan_results (user_id, scan_date DESC, ai_score DESC);

ALTER TABLE polymarket_scan_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own polymarket scans" ON polymarket_scan_results FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS polymarket_user_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  market_id TEXT NOT NULL,
  question TEXT,
  side TEXT NOT NULL,                -- 'yes' | 'no'
  shares NUMERIC NOT NULL,
  avg_price_usd NUMERIC NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  exit_price NUMERIC,
  pnl_usd NUMERIC,
  source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'wallet_sync'
  thesis TEXT,
  notes TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolution_outcome TEXT,                  -- 'yes' | 'no' | null
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polymarket_bets_user
  ON polymarket_user_bets (user_id, entered_at DESC);

ALTER TABLE polymarket_user_bets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own polymarket bets" ON polymarket_user_bets FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own polymarket bets" ON polymarket_user_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own polymarket bets" ON polymarket_user_bets FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own polymarket bets" ON polymarket_user_bets FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS polymarket_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  market_id TEXT NOT NULL,
  question TEXT,
  market_url TEXT,
  user_estimate_pct NUMERIC,         -- user's own probability estimate for divergence tracking
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, market_id)
);

ALTER TABLE polymarket_watchlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own polymarket watchlist" ON polymarket_watchlist FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can insert own polymarket watchlist" ON polymarket_watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own polymarket watchlist" ON polymarket_watchlist FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE POLICY "Users can delete own polymarket watchlist" ON polymarket_watchlist FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

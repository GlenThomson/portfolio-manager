-- ── Position Plans ─────────────────────────────────────────
-- Each holding can have an agreed-upon thesis + exit rules.
-- Plan state tracks lifecycle; triggers generate inbox_items.

DO $$ BEGIN
  CREATE TYPE plan_state AS ENUM ('drafted', 'active', 'needs_attention', 'closed', 'invalidated');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_review_frequency AS ENUM ('weekly', 'monthly', 'on_earnings', 'on_event');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS position_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  state plan_state NOT NULL DEFAULT 'drafted',
  entry_thesis TEXT,
  target_price NUMERIC,
  target_event TEXT,
  target_date DATE,
  stop_price NUMERIC,
  stop_condition TEXT,
  review_frequency plan_review_frequency NOT NULL DEFAULT 'monthly',
  review_next_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_position_plans_user ON position_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_position_plans_state ON position_plans (user_id, state);

ALTER TABLE position_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own position plans"
  ON position_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own position plans"
  ON position_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own position plans"
  ON position_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own position plans"
  ON position_plans FOR DELETE USING (auth.uid() = user_id);


-- ── Inbox Items ────────────────────────────────────────────
-- In-app notifications surfaced by the daily cron and intraday alerts.
-- Email digest is a separate channel but the same items feed both.

DO $$ BEGIN
  CREATE TYPE inbox_severity AS ENUM ('info', 'warning', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,         -- e.g. 'plan_target_hit', 'plan_stop_threatened', 'earnings_upcoming', 'new_position_no_plan'
  severity inbox_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  symbol TEXT,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_user_unread
  ON inbox_items (user_id, read_at, created_at DESC);

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inbox"
  ON inbox_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own inbox"
  ON inbox_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inbox"
  ON inbox_items FOR DELETE USING (auth.uid() = user_id);
-- NOTE: server-side cron inserts via service role (bypasses RLS).


-- ── Digest Runs ────────────────────────────────────────────
-- Audit trail of daily digest sends — prevents dupes, tracks opens.

CREATE TABLE IF NOT EXISTS digest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  digest_date DATE NOT NULL,
  content JSONB NOT NULL,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_user_date
  ON digest_runs (user_id, digest_date DESC);

ALTER TABLE digest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own digest runs"
  ON digest_runs FOR SELECT USING (auth.uid() = user_id);

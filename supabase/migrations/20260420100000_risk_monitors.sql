-- ── Risk Monitors ──────────────────────────────────────────
-- User-defined risks (e.g. "Taiwan invasion", "Banking crisis").
-- System scans news daily, AI scores each headline, composite = risk score 0-100.
-- Generic: any topic describable in natural language works.

CREATE TABLE IF NOT EXISTS risk_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',         -- phrases to search in news (AI-extracted from description)
  linked_tickers TEXT[] NOT NULL DEFAULT '{}',   -- optional: tickers whose vol/moves factor into score
  alert_on_level INTEGER,                        -- notify if score crosses this absolute level (0-100)
  alert_on_change INTEGER,                       -- notify if score changes by this much in 24h (0-100)
  latest_score INTEGER,                          -- denormalised: most recent score, for list views
  latest_score_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_monitors_user ON risk_monitors (user_id, is_active);

ALTER TABLE risk_monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own risk monitors"
  ON risk_monitors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own risk monitors"
  ON risk_monitors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own risk monitors"
  ON risk_monitors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own risk monitors"
  ON risk_monitors FOR DELETE USING (auth.uid() = user_id);


-- ── Risk Scores (daily snapshots + evidence log) ───────────

CREATE TABLE IF NOT EXISTS risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL REFERENCES risk_monitors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL,
  components JSONB,      -- per-source breakdown: { news: {score, count}, market: {...} }
  headlines JSONB,       -- top scored headlines: [{ title, url, source, severity, direction, reasoning }]
  summary TEXT,          -- 1-2 sentence AI summary of "what's happening"
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_monitor_time
  ON risk_scores (monitor_id, computed_at DESC);

ALTER TABLE risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own risk scores"
  ON risk_scores FOR SELECT USING (auth.uid() = user_id);
-- Inserts are service-role only (cron + manual compute endpoints).

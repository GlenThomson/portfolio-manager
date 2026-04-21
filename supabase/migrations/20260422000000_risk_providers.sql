-- Add providers jsonb to risk_monitors. Each risk can enable multiple data
-- sources ("news", "market", "polymarket", "taiwan_incursions", etc.).
-- Default: news-only (backward compatible with Tier 1 generic risks).

ALTER TABLE risk_monitors
  ADD COLUMN IF NOT EXISTS providers JSONB NOT NULL DEFAULT '["news"]'::jsonb;

-- risk_scores already has a `components` JSONB column — we'll use it to store
-- per-provider breakdowns (score, weight, summary, data) from the new pipeline.

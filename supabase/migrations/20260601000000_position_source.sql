-- Each portfolio position now carries an explicit source so the sync layer
-- can decide what it owns (and what to auto-close) without inferring from
-- transactions.
--
-- Values: "akahu", "ibkr", "csv", "manual", "unknown"

ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_portfolio_positions_source
  ON portfolio_positions (portfolio_id, source);

-- Backfill: infer source from existing transactions.
-- A position is considered akahu/ibkr-owned if it has at least one transaction
-- with a matching broker_ref prefix. Manual/CSV imports are harder to tell apart,
-- so any remaining unknown ones stay "unknown" — the user can override via UI.

UPDATE portfolio_positions p
SET source = 'akahu'
WHERE source = 'unknown'
  AND EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.portfolio_id = p.portfolio_id
      AND t.symbol = p.symbol
      AND t.broker_ref LIKE 'akahu-%'
  );

UPDATE portfolio_positions p
SET source = 'ibkr'
WHERE source = 'unknown'
  AND EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.portfolio_id = p.portfolio_id
      AND t.symbol = p.symbol
      AND t.broker_ref LIKE 'ibkr-%'
  );

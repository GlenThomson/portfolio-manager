-- Hedge candidates per risk monitor.
-- Tickers the user wants to consider for protective trades when this risk is
-- elevated. The system scores each on entry attractiveness (oversold, recent
-- drawdown, etc.) and flags alignment of "risk elevated + entry favorable".

ALTER TABLE risk_monitors
  ADD COLUMN IF NOT EXISTS hedge_tickers TEXT[] NOT NULL DEFAULT '{}';

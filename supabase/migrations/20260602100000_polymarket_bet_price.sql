-- Snapshot of latest market price on each bet — updated by wallet sync.
-- Lets us compute live unrealized PnL without a separate lookup.

ALTER TABLE polymarket_user_bets
  ADD COLUMN IF NOT EXISTS current_price_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS current_price_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Cached last-known price + currency on each position. Set during broker sync
-- (e.g. IBKR provides positionValue/quantity, Akahu provides pricePerUnit).
-- The UI uses live Yahoo quotes when available, falling back to this for
-- instruments Yahoo can't price (options, foreign stocks, illiquid names).

ALTER TABLE portfolio_positions
  ADD COLUMN IF NOT EXISTS last_price NUMERIC,
  ADD COLUMN IF NOT EXISTS last_price_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

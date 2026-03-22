-- Assets & Liabilities table for net worth tracking
CREATE TABLE IF NOT EXISTS assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('property', 'vehicle', 'cash', 'crypto', 'kiwisaver', 'other-asset', 'mortgage', 'loan', 'credit-card', 'other-liability')),
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NZD',
  address TEXT,
  purchase_price NUMERIC,
  purchase_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Income entries table (non-dividend income)
CREATE TABLE IF NOT EXISTS income_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('salary', 'rental', 'interest', 'side-income', 'other')),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',
  date DATE NOT NULL,
  recurring BOOLEAN DEFAULT FALSE,
  frequency TEXT CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annually')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own assets"
  ON assets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own income entries"
  ON income_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_assets_user_id ON assets(user_id);
CREATE INDEX idx_income_entries_user_id ON income_entries(user_id);
CREATE INDEX idx_income_entries_date ON income_entries(user_id, date);

-- Income categorisation rules — learned from user classifications
CREATE TABLE IF NOT EXISTS income_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_pattern TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('salary', 'rental', 'interest', 'side-income', 'other')),
  source_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, match_pattern)
);

-- RLS
ALTER TABLE income_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own rules"
  ON income_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_income_rules_user ON income_rules(user_id);

-- Add origin tracking to income_entries so we know which came from bank sync
ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'manual';
ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS bank_ref TEXT;
ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- Prevent duplicate bank transaction imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_entries_bank_ref
  ON income_entries(user_id, bank_ref) WHERE bank_ref IS NOT NULL;

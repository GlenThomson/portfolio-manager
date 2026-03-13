-- Add "cash" to the asset_type enum
ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'cash';

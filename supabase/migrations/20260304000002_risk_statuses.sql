-- Add risk-specific statuses to item_status enum
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'identified';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'assessing';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'mitigated';
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'closed';

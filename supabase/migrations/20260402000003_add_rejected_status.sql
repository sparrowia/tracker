-- Add 'rejected' to the item_status enum
ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'rejected';

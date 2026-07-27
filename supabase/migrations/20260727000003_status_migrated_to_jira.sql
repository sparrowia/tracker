-- Add "Migrated to JIRA" to the item_status enum.
--
-- For RAID issues whose tracking has moved to a Jira ticket: the item stays
-- readable here with its history and comments, but nobody should be working it
-- from this board anymore.
--
-- Same pattern as 20260304000002_risk_statuses.sql. ADD VALUE is safe inside a
-- migration transaction on PG12+ so long as the new value is not USED in the
-- same transaction, which is why there is no data update here. Reclassifying
-- existing rows is done from the UI or the API afterwards.
--
-- NOTE: this deliberately does NOT join the "resolved" set in raid-log.tsx
-- (`["complete","closed"]`), so a migrated item keeps resolved_at NULL and
-- stays on the active board rather than dropping into Archived. Flip that only
-- if the intent is for these to disappear from the open list.

ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'migrated_to_jira';

-- Switch views from SECURITY DEFINER to SECURITY INVOKER
-- so they respect RLS policies on underlying tables

ALTER VIEW blocker_ages SET (security_invoker = on);
ALTER VIEW action_item_ages SET (security_invoker = on);
ALTER VIEW vendor_accountability SET (security_invoker = on);

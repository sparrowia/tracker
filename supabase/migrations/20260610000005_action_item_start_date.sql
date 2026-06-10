-- Add a start_date to action_items so tasks can carry a start + end (due) date,
-- and expose it through the action_item_ages view (active items read from the view).

ALTER TABLE public.action_items ADD COLUMN start_date date;

CREATE OR REPLACE VIEW public.action_item_ages WITH (security_invoker = on) AS
 SELECT id,
    org_id,
    title,
    description,
    owner_id,
    vendor_id,
    project_id,
    status,
    priority,
    due_date,
    first_flagged_at,
    escalation_count,
    resolved_at,
    notes,
    created_at,
    updated_at,
    include_in_meeting,
    created_by,
    stage,
    next_steps,
    parent_id,
    sort_order,
    include_in_project_meeting,
    include_in_vendor_meeting,
    EXTRACT(day FROM now() - first_flagged_at)::integer AS age_days,
        CASE
            WHEN due_date IS NULL THEN NULL::integer
            WHEN due_date < CURRENT_DATE THEN CURRENT_DATE - due_date
            ELSE 0
        END AS days_overdue,
        CASE
            WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue'::text
            WHEN priority = 'critical'::priority_level THEN 'urgent'::text
            WHEN due_date IS NOT NULL AND due_date <= (CURRENT_DATE + '3 days'::interval) THEN 'due_soon'::text
            ELSE 'normal'::text
        END AS urgency,
    section_id,
    start_date
   FROM action_items ai
  WHERE status <> 'complete'::item_status;

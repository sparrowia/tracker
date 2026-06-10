-- Expose section_id through the action_item_ages view so the project UI can
-- group action items by section. (The completed-items path reads action_items
-- directly and already has section_id; the active path uses this view, which did not.)
-- Preserves security_invoker=on. section_id appended last (CREATE OR REPLACE only
-- allows adding new columns at the end).

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
    section_id
   FROM action_items ai
  WHERE status <> 'complete'::item_status;

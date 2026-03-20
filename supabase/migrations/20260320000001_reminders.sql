-- Reminders table
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('action_item', 'blocker', 'raid_entry')),
  entity_id uuid NOT NULL,
  remind_at timestamptz NOT NULL,
  title text NOT NULL,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_reminders_profile_id ON public.reminders(profile_id);
CREATE INDEX idx_reminders_remind_at ON public.reminders(remind_at);
CREATE INDEX idx_reminders_entity_id ON public.reminders(entity_id);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Users can only see their own reminders
CREATE POLICY "reminders_select_own"
ON public.reminders FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

-- Users can only create their own reminders
CREATE POLICY "reminders_insert_own"
ON public.reminders FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

-- Users can only update their own reminders
CREATE POLICY "reminders_update_own"
ON public.reminders FOR UPDATE
TO authenticated
USING (profile_id = auth.uid());

-- Users can only delete their own reminders
CREATE POLICY "reminders_delete_own"
ON public.reminders FOR DELETE
TO authenticated
USING (profile_id = auth.uid());

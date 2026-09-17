-- Deleting a person should not be refused because they once reported something.
--
-- raid_entries.reporter_id was created with no ON DELETE rule, so Postgres
-- blocked the delete outright. That is right for a live duty like executive
-- sponsor, where the project would silently lose its owner, but reporter is a
-- record of who raised an item, not a responsibility anyone has to inherit.
-- One issue reported years ago was enough to make a person undeletable, with
-- no explanation offered.
--
-- 350 rows across 15 people carry a reporter today. This clears the column on
-- delete instead, matching the sixteen other references to people(id) that
-- already behave this way. The three that still block deliberately are
-- projects.executive_sponsor_id, initiatives.executive_sponsor_id and
-- project_department_statuses.rep_person_id: each must be reassigned by hand.

ALTER TABLE public.raid_entries
  DROP CONSTRAINT IF EXISTS raid_entries_reporter_id_fkey;

ALTER TABLE public.raid_entries
  ADD CONSTRAINT raid_entries_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.people(id) ON DELETE SET NULL;

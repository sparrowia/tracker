-- QA role (Matt 2026-07-02): a tier between user and admin. On projects where
-- their person is a member (project_members), QA can do everything EXCEPT
-- delete other people's tasks; they can delete their own. Policies land in the
-- next migration — the new enum value must commit before it can be referenced.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'qa';

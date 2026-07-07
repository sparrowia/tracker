-- Two-agent collaboration system (Two_Agent_Collaboration_Spec.md §11.1).
-- The durable task state machine + an append-only protocol log. The tracker's
-- Slack-events endpoint writes here; the local execution runner(s) poll here.
-- Service-role only (RLS on, no anon/user policies).

create table if not exists public.agent_tasks (
  id                uuid primary key default gen_random_uuid(),
  -- Slack coordination
  slack_channel     text,
  slack_thread_ts   text,                 -- the thread this task lives in
  created_by        text,                 -- Slack user id that opened it
  -- Optional link back to a tracker item
  tracker_item_id   uuid,
  tracker_item_type text,                 -- 'action_item' | 'raid_entry'
  -- Work
  title             text not null,
  repo              text,                 -- target repo path/name
  branch            text,
  pr_url            text,
  -- Roles: 'claude' | 'gpt'
  lead              text,
  qa                text,
  -- State machine (§11.1)
  state             text not null default 'pending'
                      check (state in ('pending','in_progress','blocked','verify','complete','rejected','paused')),
  round             int not null default 0,
  -- Turn / lease control so a runner never double-processes a task
  next_actor        text,                 -- 'claude' | 'gpt' | 'matt' | null
  lease_until       timestamptz,          -- a runner claims by setting this
  leased_by         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists agent_tasks_turn_idx
  on public.agent_tasks (next_actor, state)
  where state in ('pending','in_progress');
create index if not exists agent_tasks_thread_idx
  on public.agent_tasks (slack_thread_ts);

-- Append-only protocol log: every plan, diff, verdict, AGREE, command.
create table if not exists public.agent_task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.agent_tasks(id) on delete cascade,
  agent       text,                        -- 'claude' | 'gpt' | 'matt' | 'system'
  kind        text not null,               -- message|plan|frame|diff|verdict|blocking|non_blocking|clean|agree|agree_to_verify|stop|pause|ack|escalation
  body        text,
  slack_ts    text,                        -- source Slack message ts (dedupe)
  created_at  timestamptz not null default now()
);

create index if not exists agent_task_events_task_idx
  on public.agent_task_events (task_id, created_at);
create unique index if not exists agent_task_events_slackts_uidx
  on public.agent_task_events (slack_ts) where slack_ts is not null;

alter table public.agent_tasks enable row level security;
alter table public.agent_task_events enable row level security;
-- No policies → service-role only.

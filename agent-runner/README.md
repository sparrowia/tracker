# Two-Agent Runner (local)

Claude and GPT collaborate on a task you post in Slack. This is the **local
execution half** — you start it on your machine; the tracker (Vercel) handles the
Slack side and the shared task state. Design: `Two_Agent_Collaboration_Spec.md`.

## How you use it (once it's set up)
1. In **#uni2-coding**, @-mention the bot with a task, e.g.
   `@Ed add a report-only CSP to the admin app`.
2. The tracker opens a task, acks in a thread, and sets **Claude = Lead, GPT = QA**.
3. The runners take over in that thread: Claude frames + implements, GPT reviews
   adversarially, they converge, and QA posts **AGREE** → task goes to **Verify**.
4. You can step in any time in the thread: `STOP <task-id>` or `PAUSE <task-id>`.

## One-time setup

**1. Apply the migration** (creates the task tables): run
`~/Downloads/20260707000001_agent_tasks.sql` in the Supabase SQL editor.

**2. Slack app config** (like the Zoom webhook — Matt does this once):
- Event Subscriptions → ON → Request URL: `https://edcet-tracker.vercel.app/api/slack/events`
- Subscribe to bot events: `app_mention`, `message.channels`
- Scopes: `app_mentions:read`, `chat:write`, `channels:history`
- Reinstall the app; make sure the bot is in **#uni2-coding**.

**3. Tracker env vars** (Vercel project `edcet-tracker`, all environments):
- `SLACK_SIGNING_SECRET` — from the Slack app's *Basic Information*
- `AGENT_SLACK_CHANNEL_ID` — the #uni2-coding channel id (`C0BFN9Y6CJJ`)
- `AGENT_ALLOWED_USER_IDS` — your Slack user id (only you can open/STOP/PAUSE tasks)

**4. Runner env**: `cp agent-runner/.env.example agent-runner/.env` and paste the
Supabase URL + service key + `SLACK_BOT_TOKEN` from the tracker's root `.env.local`.

## Start it
```bash
./agent-runner/start-claude.sh
```
Leave that terminal open — it polls every 15s and logs what it does. `Ctrl-C` stops it.
(GPT runs the mirror: `./agent-runner/start-gpt.sh`, after setting its own CLI —
see the GPT build prompt.)

## Notes / safety
- Only your Slack user id may open or STOP/PAUSE tasks (channel + user allowlist).
- The two runners never double-process a task (short DB lease per turn).
- QA is read-only; only the Lead writes the repo.
- After `MAX_REVIEW_ROUNDS` (default 2) an unresolved BLOCKING escalates to you.
- This is v1: the quality of each turn depends on the agent CLI's headless run.
  Watch the first few tasks in-thread before trusting it on anything risky
  (pilot ladder: docs → small helper → low-risk admin UI → then payments/auth/data).

#!/usr/bin/env node
// Two-agent collaboration — LOCAL EXECUTION RUNNER.
//
// One generic runner, parameterized by which agent it is (AGENT) and which CLI
// to invoke to do the actual work (AGENT_CMD). Start one instance per agent:
//
//   Claude:  AGENT=claude AGENT_CMD='claude -p'          node agent-runner/runner.mjs
//   GPT:     AGENT=gpt    AGENT_CMD='codex exec'         node agent-runner/runner.mjs
//
// It polls the tracker's agent_tasks queue for tasks where it's this agent's
// turn, claims one via a short lease (so the two runners never double-process),
// runs the agent CLI headless in the target repo to do the protocol step, posts
// the result to the Slack thread, advances the state machine, and releases.
//
// Env (put in agent-runner/.env or export before running):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (tracker DB)
//   SLACK_BOT_TOKEN                                        (post to threads)
//   AGENT            = 'claude' | 'gpt'
//   AGENT_CMD        = the headless CLI, e.g. 'claude -p'
//   REPO_PATH        = target repo to work in (default: ~/projects/edcetera-platform)
//   POLL_SECONDS     = default 15
//   MAX_REVIEW_ROUNDS= default 2

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// --- config -----------------------------------------------------------------
const envFile = path.join(path.dirname(new URL(import.meta.url).pathname), '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const AGENT = process.env.AGENT;
const AGENT_CMD = process.env.AGENT_CMD;
const REPO_PATH = process.env.REPO_PATH || '/Volumes/Avalon/Working/edcetera-platform';
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 15);
const MAX_ROUNDS = Number(process.env.MAX_REVIEW_ROUNDS || 2);
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!AGENT || !AGENT_CMD) { console.error('Set AGENT and AGENT_CMD.'); process.exit(1); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const log = (...a) => console.log(`[${new Date().toISOString()}][${AGENT}]`, ...a);

// --- helpers ----------------------------------------------------------------
async function postToThread(channel, threadTs, text) {
  if (!BOT_TOKEN) return;
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  }).catch(() => {});
}
async function recordEvent(taskId, kind, body) {
  await db.from('agent_task_events').insert({ task_id: taskId, agent: AGENT, kind, body: String(body).slice(0, 12000) });
}
async function threadHistory(taskId) {
  const { data } = await db.from('agent_task_events').select('agent,kind,body,created_at').eq('task_id', taskId).order('created_at', { ascending: true });
  return (data || []).map((e) => `[${e.agent}·${e.kind}] ${e.body}`).join('\n\n').slice(0, 20000);
}
// Run the agent CLI headless in the repo. Returns its final stdout.
function runAgent(prompt) {
  const cmd = `${AGENT_CMD} ${JSON.stringify(prompt)}`;
  log('invoking:', AGENT_CMD, `(${prompt.length} char prompt) in ${REPO_PATH}`);
  return execSync(cmd, { cwd: REPO_PATH, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
}

// --- prompt builders (the protocol steps) -----------------------------------
function leadPrompt(task, history) {
  return `You are the LEAD (coding) agent in a two-agent Claude+GPT workflow. Task ${task.id}: "${task.title}".
Working repo: ${REPO_PATH}. Branch to use: agent/${task.id.slice(0, 8)}.
Follow the collaboration spec: post a FRAME (scope, acceptance criteria, files/systems, test plan, branch), then IMPLEMENT on that branch, run the repo's checks, and open a PR.
Thread so far:\n${history || '(none)'}\n
Output a concise Slack-ready summary: the FRAME, what you changed, the evidence (tests/build), and the PR/branch. Keep it under ~250 words. Do NOT mark anything complete — QA reviews next.`;
}
function qaPrompt(task, history) {
  return `You are the QA (adversarial reviewer) agent in a two-agent Claude+GPT workflow. Task ${task.id}: "${task.title}".
Working repo: ${REPO_PATH}. Branch: agent/${task.id.slice(0, 8)}. You are READ-ONLY: inspect, run tests/smokes, write temp scripts, but do NOT modify repo files or tracker state.
Apply the bright-line block rule: block ONLY for unmet acceptance criteria, a reproducible bug/failing test, a concrete security/auth/data risk, a migration/env/deploy gap, missing verification of a money/auth/compliance path, a regression, an explicit-decision contradiction, or materially-unsafe-to-deploy. Do NOT block for style/preference/speculation/out-of-scope polish.
Thread so far:\n${history || '(none)'}\n
Reply with EXACTLY ONE verdict, first line one of: "BLOCKING: <finding>", "NON-BLOCKING: <finding>", or "CLEAN". If CLEAN, then also output a structured AGREE:
AGREE
Scope checked:
Evidence accepted:
Residual follow-ups:`;
}

// --- one task cycle ---------------------------------------------------------
async function claimNext() {
  const nowIso = new Date().toISOString();
  const { data: tasks } = await db
    .from('agent_tasks')
    .select('*')
    .eq('next_actor', AGENT)
    .in('state', ['pending', 'in_progress'])
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1);
  const task = tasks?.[0];
  if (!task) return null;
  const lease = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: claimed } = await db
    .from('agent_tasks')
    .update({ lease_until: lease, leased_by: AGENT })
    .eq('id', task.id)
    .eq('next_actor', AGENT) // re-check to avoid a race with the other runner
    .or(`lease_until.is.null,lease_until.lt.${nowIso}`)
    .select('*')
    .maybeSingle();
  return claimed || null;
}

async function handle(task) {
  const iAmLead = task.lead === AGENT;
  const history = await threadHistory(task.id);
  const isReview = task.state === 'in_progress' && task.qa === AGENT;

  // STOP/PAUSE respected: only 'pending'/'in_progress' get here (claimNext filters).
  let output;
  try {
    output = runAgent(iAmLead && task.state === 'pending' ? leadPrompt(task, history) : isReview ? qaPrompt(task, history) : leadPrompt(task, history));
  } catch (e) {
    log('agent run failed:', e.message);
    await db.from('agent_tasks').update({ lease_until: null, leased_by: null }).eq('id', task.id);
    await postToThread(task.slack_channel, task.slack_thread_ts, `:warning: *[${AGENT}]* run errored: ${String(e.message).slice(0, 300)}`);
    return;
  }

  const roleTag = iAmLead && task.state === 'pending' ? `${AGENT} · Lead` : isReview ? `${AGENT} · QA` : `${AGENT} · Lead`;
  await postToThread(task.slack_channel, task.slack_thread_ts, `*[${roleTag}]*\n${output.trim().slice(0, 3500)}`);

  // Advance the state machine.
  const upper = (output || '').toUpperCase();
  const update = { lease_until: null, leased_by: null, updated_at: new Date().toISOString() };

  if (iAmLead && task.state === 'pending') {
    // Lead framed + implemented → QA reviews.
    await recordEvent(task.id, 'diff', output);
    Object.assign(update, { state: 'in_progress', next_actor: task.qa, round: 1 });
  } else if (isReview) {
    if (upper.startsWith('CLEAN') || upper.includes('\nAGREE')) {
      await recordEvent(task.id, 'agree', output);
      Object.assign(update, { state: upper.includes('AGREE_TO_VERIFY') ? 'verify' : 'verify', next_actor: task.lead });
      await postToThread(task.slack_channel, task.slack_thread_ts, `:white_check_mark: QA AGREE — task \`${task.id}\` → *Verify*. Lead merges + moves the tracker item.`);
    } else if (upper.startsWith('BLOCKING')) {
      await recordEvent(task.id, 'blocking', output);
      if ((task.round || 1) >= MAX_ROUNDS) {
        Object.assign(update, { state: 'blocked', next_actor: 'matt' });
        await postToThread(task.slack_channel, task.slack_thread_ts, `:rotating_light: Convergence cap (${MAX_ROUNDS} rounds) hit on \`${task.id}\`. QA must attach a minimal repro/failing criterion, else downgrade. Escalating to Matt.`);
      } else {
        Object.assign(update, { state: 'in_progress', next_actor: task.lead, round: (task.round || 1) + 1 });
      }
    } else {
      // NON-BLOCKING or a plain message → treat as clean-enough to proceed to verify.
      await recordEvent(task.id, 'non_blocking', output);
      Object.assign(update, { state: 'verify', next_actor: task.lead });
    }
  } else {
    // Lead remediation round → back to QA.
    await recordEvent(task.id, 'diff', output);
    Object.assign(update, { state: 'in_progress', next_actor: task.qa });
  }

  await db.from('agent_tasks').update(update).eq('id', task.id);
  log(`task ${task.id} → ${update.state} (next: ${update.next_actor})`);
}

// --- main loop --------------------------------------------------------------
log(`runner up. repo=${REPO_PATH} poll=${POLL_SECONDS}s cmd="${AGENT_CMD}"`);
for (;;) {
  try {
    const task = await claimNext();
    if (task) await handle(task);
  } catch (e) {
    log('loop error:', e.message);
  }
  await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
}

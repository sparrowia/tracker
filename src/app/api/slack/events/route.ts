import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ALLOWED_CHANNEL,
  allowedUserIds,
  parseMessage,
} from '@/lib/agent-protocol';

// Two-agent system — Slack Events ingress (Spec §7, §11.8).
// Responsibilities (deliberately narrow — the RUNNERS own protocol advancement):
//   1. verify Slack signature + answer the url_verification handshake
//   2. safety: channel allowlist, user allowlist for task-open/commands,
//      ignore bot-authored messages (loop guard), dedupe by event ts
//   3. INTAKE: an @mention by an allowed user opens a task + acks in a thread
//   4. Matt's STOP / PAUSE commands in a task thread
//   5. record human thread messages as protocol events for the runners to read
// The local runners poll `agent_tasks` for their turn and drive the protocol.

export const dynamic = 'force-dynamic';

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

function verifySlackSignature(rawBody: string, ts: string | null, sig: string | null): boolean {
  if (!SIGNING_SECRET || !ts || !sig) return false;
  // Replay guard: reject requests older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${rawBody}`;
  const expected = 'v0=' + crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

async function postToThread(channel: string, threadTs: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    });
  } catch {
    /* best-effort */
  }
}

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
}

export async function POST(req: NextRequest) {
  if (!SIGNING_SECRET) return NextResponse.json({ error: 'Slack events not configured' }, { status: 503 });

  const rawBody = await req.text();
  if (!verifySlackSignature(rawBody, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: { type?: string; challenge?: string; event?: SlackEvent; event_id?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Registration handshake.
  if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge });

  const event = body.event;
  if (!event) return NextResponse.json({ ok: true });

  // Always 200 fast; do the light work inline (Slack retries on non-2xx).
  const db = createAdminClient();

  try {
    // Channel allowlist (§11.8).
    if (ALLOWED_CHANNEL && event.channel !== ALLOWED_CHANNEL) return NextResponse.json({ ok: true, skipped: 'channel' });

    // Loop guard (§11.8/#9): never act on bot-authored messages.
    if (event.bot_id || event.subtype === 'bot_message') return NextResponse.json({ ok: true, skipped: 'bot' });

    const isMention = event.type === 'app_mention';
    const isThreadReply = event.type === 'message' && !!event.thread_ts;
    const userAllowed = allowedUserIds().has(event.user || '');

    // ---- INTAKE: an @mention that starts a new task (top-level, allowed user). ----
    if (isMention && (!event.thread_ts || event.thread_ts === event.ts)) {
      if (!userAllowed) {
        // Only Matt (allowlist) may open tasks.
        if (event.channel && event.ts) await postToThread(event.channel, event.ts, ':lock: Only an allowed user can open an agent task.');
        return NextResponse.json({ ok: true, skipped: 'user not allowed' });
      }
      const title = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim().slice(0, 300) || 'Untitled task';
      // Default roles: Claude leads, GPT QAs (swappable later / by @tag).
      const { data: task, error } = await db
        .from('agent_tasks')
        .insert({
          slack_channel: event.channel,
          slack_thread_ts: event.ts,
          created_by: event.user,
          title,
          lead: 'claude',
          qa: 'gpt',
          state: 'pending',
          next_actor: 'claude',
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      if (event.channel && event.ts) {
        await postToThread(
          event.channel,
          event.ts,
          `:robot_face: *Task opened* \`${task!.id}\`\nLead: *Claude* · QA: *GPT*\nClaude will post the frame (scope · acceptance criteria · files · test plan · branch). Matt can \`STOP ${task!.id}\` or \`PAUSE ${task!.id}\` anytime.`,
        );
      }
      return NextResponse.json({ ok: true, taskId: task!.id });
    }

    // ---- Thread activity on an existing task ----
    if ((isThreadReply || isMention) && event.thread_ts) {
      const { data: task } = await db
        .from('agent_tasks')
        .select('id, state')
        .eq('slack_thread_ts', event.thread_ts)
        .maybeSingle();
      if (!task) return NextResponse.json({ ok: true, skipped: 'no task for thread' });

      // Record the human message (dedupe by slack ts).
      await db.from('agent_task_events').insert({
        task_id: task.id,
        agent: 'matt',
        kind: 'message',
        body: event.text || '',
        slack_ts: event.ts,
      });

      // Matt's STOP / PAUSE (§11.8 kill switch) — allowed users only.
      if (userAllowed) {
        const parsed = parseMessage(event.text || '');
        if (parsed.kind === 'stop') {
          await db.from('agent_tasks').update({ state: 'rejected', next_actor: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', task.id);
          if (event.channel) await postToThread(event.channel, event.thread_ts, `:octagonal_sign: Task \`${task.id}\` STOPPED by Matt. Runners will stand down.`);
        } else if (parsed.kind === 'pause') {
          await db.from('agent_tasks').update({ state: 'paused', next_actor: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', task.id);
          if (event.channel) await postToThread(event.channel, event.thread_ts, `:double_vertical_bar: Task \`${task.id}\` PAUSED. Reply \`RESUME ${task.id}\`… (or reassign) to continue.`);
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never 500 to Slack (it would retry). Log-and-ack.
    return NextResponse.json({ ok: true, note: err instanceof Error ? err.message : 'error' });
  }
}

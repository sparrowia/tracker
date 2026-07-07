// Two-agent collaboration protocol — pure logic shared by the tracker
// Slack-events endpoint and (by contract) the local runners.
// See Two_Agent_Collaboration_Spec.md.

export type Agent = 'claude' | 'gpt';
export type Actor = Agent | 'matt' | 'system';

export type TaskState =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'verify'
  | 'complete'
  | 'rejected'
  | 'paused';

// §11.1 valid transitions. Kept permissive-but-guarded: a parent cannot be
// completed while children are open (enforced by the caller, which has the tree).
export const TRANSITIONS: Record<TaskState, TaskState[]> = {
  pending: ['in_progress', 'blocked', 'paused', 'rejected'],
  in_progress: ['verify', 'blocked', 'paused', 'rejected', 'complete'],
  blocked: ['in_progress', 'pending', 'paused', 'rejected'],
  verify: ['complete', 'in_progress', 'rejected', 'blocked'],
  paused: ['in_progress', 'pending', 'blocked'],
  rejected: ['in_progress', 'pending'],
  complete: [], // terminal (re-open via a new task)
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return from === to || (TRANSITIONS[from]?.includes(to) ?? false);
}

// Structured message kinds an agent may post in a task thread (§4/§5/§11.5).
export type EventKind =
  | 'frame'
  | 'plan'
  | 'diff'
  | 'blocking'
  | 'non_blocking'
  | 'clean'
  | 'agree'
  | 'agree_to_verify'
  | 'stop'
  | 'pause'
  | 'ack'
  | 'escalation'
  | 'message';

export interface ParsedMessage {
  kind: EventKind;
  /** For stop/pause: the task id/title token that follows the command. */
  target?: string;
}

// Parse a Slack message body into a protocol event kind. Commands are matched at
// the START of the (trimmed) message so ordinary prose never trips them.
export function parseMessage(text: string): ParsedMessage {
  const t = (text || '').trim();
  const upper = t.toUpperCase();

  const stop = /^STOP\s+(\S+)/i.exec(t);
  if (stop) return { kind: 'stop', target: stop[1] };
  const pause = /^PAUSE\s+(\S+)/i.exec(t);
  if (pause) return { kind: 'pause', target: pause[1] };

  // AGREE_TO_VERIFY before AGREE (prefix).
  if (upper.startsWith('AGREE_TO_VERIFY')) return { kind: 'agree_to_verify' };
  if (upper.startsWith('AGREE')) return { kind: 'agree' };
  if (upper.startsWith('BLOCKING')) return { kind: 'blocking' };
  if (upper.startsWith('NON-BLOCKING') || upper.startsWith('NON_BLOCKING')) return { kind: 'non_blocking' };
  if (upper.startsWith('CLEAN')) return { kind: 'clean' };
  if (upper.startsWith('PLAN') || upper.startsWith('FRAME')) return { kind: 'frame' };
  if (upper.startsWith('DIFF')) return { kind: 'diff' };
  if (upper.startsWith('ESCALATE') || upper.startsWith('DISAGREEMENT')) return { kind: 'escalation' };
  return { kind: 'message' };
}

// The structured-AGREE form (§11.5) must carry these lines to count as a real
// sign-off rather than ceremony.
export function isStructuredAgree(text: string): boolean {
  const t = (text || '').toLowerCase();
  return /scope checked:/.test(t) && /evidence accepted:/.test(t) && /residual follow-ups:/.test(t);
}

// The bounded convergence loop (§5): after this many rounds a still-blocking QA
// must produce a repro or downgrade.
export const MAX_REVIEW_ROUNDS = 2;

// ---- Safety config (§11.8) ---------------------------------------------------
export const ALLOWED_CHANNEL = process.env.AGENT_SLACK_CHANNEL_ID || ''; // #uni2-coding channel id
// Only these Slack user ids may OPEN or STOP/PAUSE tasks. Comma-separated env.
export function allowedUserIds(): Set<string> {
  return new Set((process.env.AGENT_ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
}
export const AGENTS: Agent[] = ['claude', 'gpt'];

/** Loop guard (§11.8/#9): a runner acts only when it's the next_actor. This lets
 *  the endpoint safely RECORD every message while only ONE side acts on it. */
export function isAgentsTurn(agent: Agent, nextActor: string | null | undefined): boolean {
  return nextActor === agent;
}

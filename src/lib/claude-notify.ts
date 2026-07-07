// Phase 0 of the two-agent workflow: when Matt assigns a tracker item to Claude,
// ping the coding Slack channel. NOTIFICATION-ONLY — no autonomous tracker writes
// happen here; this just surfaces the signal so the collaboration protocol can be
// proven with human-visible messages before any runner gets write authority.
//
// Scoped to Matt's private workspace: it only fires when the new owner is Claude
// AND the item lives in the private PM project. The ping itself is a server-side
// Slack post (token stays server-side); nothing is surfaced in the tracker UI to
// other users.

/** Claude's `people.id`. Override via NEXT_PUBLIC_CLAUDE_PERSON_ID if it ever changes. */
export const CLAUDE_PERSON_ID =
  process.env.NEXT_PUBLIC_CLAUDE_PERSON_ID || 'ac3aa316-91a5-4e59-bd51-1c9a3ee20d4e';

/** Only Matt's private PM project triggers the ping. */
export const CLAUDE_QUEUE_PROJECT_SLUG =
  process.env.NEXT_PUBLIC_CLAUDE_QUEUE_PROJECT_SLUG || 'matt-pm-todo';

/** True when this owner change should ping the coding channel. */
export function isClaudeQueueAssignment(newOwnerId: string | null | undefined, projectSlug: string | undefined): boolean {
  return !!newOwnerId && newOwnerId === CLAUDE_PERSON_ID && projectSlug === CLAUDE_QUEUE_PROJECT_SLUG;
}

/** Fire-and-forget Slack ping. Never blocks the UI, never throws. */
export function pingClaudeQueue(payload: {
  itemTitle: string;
  itemType: string;
  entityId?: string;
  projectSlug?: string;
  displayId?: string | null;
}): void {
  try {
    void fetch('/api/notify/claude-slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}

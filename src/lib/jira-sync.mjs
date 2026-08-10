// Core of the U2 Jira board -> jira_tickets mirror. One implementation shared
// by the manual CLI (scripts/sync-jira.mjs) and the 15-minute Vercel cron
// (/api/jira/sync), so the rules below can never drift between the two.
//
// NEVER writes to Jira. Jira owns summary/description; this is a one-way mirror.
//
// Local fields protected from being clobbered on re-sync:
//   due_date     — for a ticket whose Release Target has a date in
//                  RELEASE_DATES below, the release date OWNS due_date and a
//                  re-sync moves the card whenever the target (or a date here)
//                  changes. Roadmap drag-scheduling only sticks for tickets
//                  with no mapped target.
//   plain_summary — only regenerated while auto_summary is true, so a
//                   hand-written label stays put.
//   business_unit — the roadmap's own owning-team classification. Deliberately
//                   absent from toRecord() below: PostgREST's upsert only
//                   UPDATEs the columns present in the payload, so leaving it
//                   out is what preserves it. Do not "helpfully" add it.

import { createClient } from '@supabase/supabase-js';
import { plainSummary, adfToText } from './jira-plain-summary.mjs';

// Release Target -> ship date. Jira itself carries no dates (no due dates, no
// versions), so this map is the schedule. When a release date slips, change it
// here and redeploy (or re-run the CLI with --apply) — every card on that
// release moves in one pass. Targets not listed (Untargeted, Future, or a
// brand-new release) leave their cards drag-schedulable on the roadmap.
export const RELEASE_DATES = {
  'DCHours R1': '2026-08-05',
};

const ORG_ID = 'caaa4383-47d2-4e08-8369-b55865b5e1a5';
const UNIFIED_2_PROJECT_ID = '210245ad-88c2-4914-83bd-cad75bf757fd';
const JIRA_HOST = 'https://xprepls.atlassian.net';
const JIRA_BASE = `${JIRA_HOST}/browse/`;
const RELEASE_TARGET_FIELD = 'customfield_11220';
const FIELDS = `summary,description,status,issuetype,priority,assignee,duedate,labels,created,updated,parent,${RELEASE_TARGET_FIELD}`;

async function fetchAllIssues(auth) {
  const issues = [];
  let token = null;
  for (;;) {
    const params = new URLSearchParams({ jql: 'project = U2 ORDER BY created ASC', maxResults: '100', fields: FIELDS });
    if (token) params.set('nextPageToken', token);
    const res = await fetch(`${JIRA_HOST}/rest/api/3/search/jql?${params}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    issues.push(...(d.issues || []));
    if (d.isLast || !d.nextPageToken) break;
    token = d.nextPageToken;
  }
  return issues;
}

const pickValue = (f) => (f && typeof f === 'object' && 'value' in f ? f.value : f || null);
// Truncated so one pathological ticket can't bloat every roadmap page load.
const MAX_DESCRIPTION = 8000;

function toRecord(issue) {
  const f = issue.fields;
  const description = adfToText(f.description).replace(/\n{3,}/g, '\n\n').trim() || null;
  return {
    org_id: ORG_ID,
    project_id: UNIFIED_2_PROJECT_ID,
    jira_key: issue.key,
    summary: f.summary,
    description: description ? description.slice(0, MAX_DESCRIPTION) : null,
    plain_summary: plainSummary({
      summary: f.summary,
      description,
      labels: f.labels,
      issueType: f.issuetype?.name,
    }),
    status: f.status?.name ?? null,
    status_category: f.status?.statusCategory?.key ?? null,
    issue_type: f.issuetype?.name ?? null,
    jira_priority: f.priority?.name ?? null,
    assignee_name: f.assignee?.displayName ?? null,
    release_target: pickValue(f[RELEASE_TARGET_FIELD]),
    epic: f.parent?.fields?.summary ?? null,
    labels: f.labels || [],
    jira_url: JIRA_BASE + issue.key,
    jira_created_at: f.created ?? null,
    jira_updated_at: f.updated ?? null,
    imported_at: new Date().toISOString(),
  };
}

export async function runJiraSync({ jiraEmail, jiraToken, supabaseUrl, supabaseKey, apply = false, log = console.log }) {
  if (!jiraEmail || !jiraToken) throw new Error('Missing JIRA_EMAIL / JIRA_API_TOKEN');
  if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase URL / service-role key');

  const sb = createClient(supabaseUrl, supabaseKey);
  const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');

  const issues = await fetchAllIssues(auth);
  log(`Jira: fetched ${issues.length} U2 issues`);

  const { data: existingRows, error: readErr } = await sb
    .from('jira_tickets')
    .select('jira_key, due_date, plain_summary, auto_summary');
  if (readErr) throw new Error(`read existing failed: ${readErr.message}`);
  const existing = new Map((existingRows || []).map((r) => [r.jira_key, r]));

  const records = issues.map(toRecord);
  let inserts = 0, updates = 0, pinned = 0, moved = 0;
  for (const r of records) {
    // A mapped release target owns the schedule; otherwise local drag-scheduling
    // wins. due_date is set on EVERY record so the bulk upsert has uniform keys.
    const releaseDate = RELEASE_DATES[r.release_target] ?? null;
    const prev = existing.get(r.jira_key);
    if (!prev) { r.due_date = releaseDate; inserts++; continue; }
    updates++;
    r.due_date = releaseDate ?? prev.due_date;
    if (r.due_date !== prev.due_date) moved++;
    // A human-pinned label is never overwritten.
    if (prev.auto_summary === false) { r.plain_summary = prev.plain_summary; pinned++; }
  }

  const unmappedTargets = [...new Set(records.map((r) => r.release_target).filter((t) => t && !RELEASE_DATES[t]))];

  // Tickets we hold that Jira no longer returns (deleted, or moved out of U2).
  const seen = new Set(records.map((r) => r.jira_key));
  const orphans = (existingRows || []).filter((r) => !seen.has(r.jira_key)).map((r) => r.jira_key);

  log(`plan: ${inserts} new, ${updates} updated (${pinned} with a pinned label kept, ${moved} rescheduled by release date), ${orphans.length} in our table but not on the board`);
  if (orphans.length) log('  not on board:', orphans.join(', '));
  log('release targets without a date in RELEASE_DATES (cards stay drag-schedulable):', unmappedTargets.join(', ') || 'none');

  const summary = { applied: apply, fetched: issues.length, inserts, updates, moved, pinned, orphans, unmappedTargets };

  if (!apply) return summary;

  // Chunked so one oversized payload can't fail the whole run.
  const CHUNK = 100;
  let written = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const { data, error } = await sb.from('jira_tickets').upsert(batch, { onConflict: 'jira_key' }).select('id');
    if (error) throw new Error(`upsert failed at ${i}: ${error.message}`);
    written += data.length;
  }
  log(`wrote ${written} tickets`);
  return { ...summary, written };
}

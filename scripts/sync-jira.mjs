// Full refresh of the Unified 2 roadmap from the live U2 Jira board.
//
//   node scripts/sync-jira.mjs            # dry run — prints the plan, writes nothing
//   node scripts/sync-jira.mjs --apply
//
// Replaces the earlier one-off _import-jira-r2.mjs, which read a hand-produced
// JSON export. This talks to Jira REST directly, so "refresh everything" is one
// command.
//
// Writes: summary, description (ADF flattened to text), status, type, priority,
// assignee, release target, epic, labels, timestamps, and plain_summary — the
// non-technical card label from ./jira-plain-summary.mjs.
//
// NEVER writes to Jira. Jira owns summary/description; this is a one-way mirror.
//
// Two local-only fields are protected from being clobbered on re-sync:
//   due_date     — roadmap drag-scheduling. Only set on INSERT; never updated.
//   plain_summary — only regenerated while auto_summary is true, so a
//                   hand-written label stays put.
//   business_unit — the roadmap's own owning-team classification. Deliberately
//                   absent from toRecord() below: PostgREST's upsert only
//                   UPDATEs the columns present in the payload, so leaving it
//                   out is what preserves it. Do not "helpfully" add it.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { plainSummary, adfToText } from './jira-plain-summary.mjs';

const APPLY = process.argv.includes('--apply');

const readEnv = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim().replace(/^"|"$/g, ''); return a; }, {});

const env = readEnv('/Users/matthewlobel/projects/edcetera-pm/.env.local');
// Jira credentials live with the platform repo (that's where the REST token is
// configured); read them from there rather than duplicating the secret.
const platformEnv = readEnv('/Volumes/Avalon/Working/edcetera-platform/.env.local');
const JIRA_EMAIL = platformEnv.JIRA_EMAIL;
const JIRA_TOKEN = platformEnv.JIRA_API_TOKEN;
if (!JIRA_EMAIL || !JIRA_TOKEN) { console.error('Missing JIRA_EMAIL / JIRA_API_TOKEN'); process.exit(1); }

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ORG_ID = 'caaa4383-47d2-4e08-8369-b55865b5e1a5';
const UNIFIED_2_PROJECT_ID = '210245ad-88c2-4914-83bd-cad75bf757fd';
const JIRA_HOST = 'https://xprepls.atlassian.net';
const JIRA_BASE = `${JIRA_HOST}/browse/`;
const RELEASE_TARGET_FIELD = 'customfield_11220';
const FIELDS = `summary,description,status,issuetype,priority,assignee,duedate,labels,created,updated,parent,${RELEASE_TARGET_FIELD}`;

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');

async function fetchAllIssues() {
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

const issues = await fetchAllIssues();
console.log(`Jira: fetched ${issues.length} U2 issues`);

const { data: existingRows, error: readErr } = await sb
  .from('jira_tickets')
  .select('jira_key, due_date, plain_summary, auto_summary');
if (readErr) { console.error('read existing failed:', readErr.message); process.exit(1); }
const existing = new Map((existingRows || []).map((r) => [r.jira_key, r]));

const records = issues.map(toRecord);
let inserts = 0, updates = 0, pinned = 0;
for (const r of records) {
  const prev = existing.get(r.jira_key);
  if (!prev) { inserts++; continue; }
  updates++;
  // Local scheduling wins — the roadmap owns due_date, not Jira.
  r.due_date = prev.due_date;
  // A human-pinned label is never overwritten.
  if (prev.auto_summary === false) { r.plain_summary = prev.plain_summary; pinned++; }
}

// Tickets we hold that Jira no longer returns (deleted, or moved out of U2).
const seen = new Set(records.map((r) => r.jira_key));
const orphans = (existingRows || []).filter((r) => !seen.has(r.jira_key)).map((r) => r.jira_key);

const byLabel = {};
for (const r of records) byLabel[r.plain_summary] = (byLabel[r.plain_summary] || 0) + 1;

console.log(`plan: ${inserts} new, ${updates} updated (${pinned} with a pinned label kept), ${orphans.length} in our table but not on the board`);
if (orphans.length) console.log('  not on board:', orphans.join(', '));
console.log(`distinct plain-language labels: ${Object.keys(byLabel).length}`);
console.log('top labels:', Object.entries(byLabel).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, c]) => `${l} (${c})`).join(', '));
console.log('no description:', records.filter((r) => !r.description).map((r) => r.jira_key).join(', ') || 'none');

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  console.log('sample of 5 cards as they will read:');
  for (const r of records.slice(0, 5)) console.log(`  ${r.jira_key.padEnd(8)} ${r.plain_summary.padEnd(34)} <- ${r.summary.slice(0, 60)}`);
  process.exit(0);
}

// Chunked so one oversized payload can't fail the whole run.
const CHUNK = 100;
let written = 0;
for (let i = 0; i < records.length; i += CHUNK) {
  const batch = records.slice(i, i + CHUNK);
  const { data, error } = await sb.from('jira_tickets').upsert(batch, { onConflict: 'jira_key' }).select('id');
  if (error) { console.error(`upsert failed at ${i}:`, error.message); process.exit(1); }
  written += data.length;
}
console.log(`wrote ${written} tickets`);

const { count } = await sb.from('jira_tickets').select('*', { count: 'exact', head: true });
const { data: targets } = await sb.from('jira_tickets').select('release_target');
const counts = {};
for (const t of targets || []) counts[t.release_target || '(none)'] = (counts[t.release_target || '(none)'] || 0) + 1;
console.log('total in table:', count, JSON.stringify(counts));

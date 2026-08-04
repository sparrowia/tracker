// One-off: import R2+ U2 (Unified V2) Jira tickets into jira_tickets.
// Source file produced from the live Jira board on 2026-08-04 (Release Target
// in "DCHours R2" / "Future (Deferred)"). Re-runnable: upserts by jira_key.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ORG_ID = 'caaa4383-47d2-4e08-8369-b55865b5e1a5';
const UNIFIED_2_PROJECT_ID = '210245ad-88c2-4914-83bd-cad75bf757fd';
const JIRA_BASE = 'https://xprepls.atlassian.net/browse/';

const file = process.argv[2];
if (!file) { console.error('usage: node _import-jira-r2.mjs <jira-r2.json>'); process.exit(1); }
const rows = JSON.parse(readFileSync(file, 'utf8'));

const records = rows.map(([key, summary, status, statusCategory, issueType, priority, assignee, dueDate, labels, releaseTarget, epic]) => ({
  org_id: ORG_ID,
  project_id: UNIFIED_2_PROJECT_ID,
  jira_key: key,
  summary,
  status,
  status_category: statusCategory,
  issue_type: issueType,
  jira_priority: priority,
  assignee_name: assignee,
  due_date: dueDate,
  labels: labels || [],
  release_target: releaseTarget,
  epic,
  jira_url: JIRA_BASE + key,
}));

const { data, error } = await sb.from('jira_tickets').upsert(records, { onConflict: 'jira_key' }).select('id');
if (error) { console.error('IMPORT FAILED:', error.message); process.exit(1); }
console.log('imported/updated:', data.length, 'tickets');

const { count } = await sb.from('jira_tickets').select('*', { count: 'exact', head: true });
const { data: byTarget } = await sb.from('jira_tickets').select('release_target');
const counts = {};
for (const t of byTarget) counts[t.release_target] = (counts[t.release_target] || 0) + 1;
console.log('total in table:', count, JSON.stringify(counts));

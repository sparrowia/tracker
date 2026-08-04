// One-off: mark imported jira_tickets that have an associated PR in
// ed-cet/unified. Input: pr-map.json ({ "U2-123": [{n: 42, s: "MERGED"}] })
// built from `gh pr list`. Idempotent full sync: clears flags for keys
// no longer referenced.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const file = process.argv[2];
if (!file) { console.error('usage: node _set-jira-pr-refs.mjs <pr-map.json>'); process.exit(1); }
const map = JSON.parse(readFileSync(file, 'utf8'));

const { data: tickets, error } = await sb.from('jira_tickets').select('id, jira_key');
if (error) { console.error(error.message); process.exit(1); }

let flagged = 0, cleared = 0;
for (const t of tickets) {
  const prs = map[t.jira_key];
  const nums = prs ? [...new Set(prs.map(p => p.n))].sort((a, b) => a - b) : [];
  const { error: e } = await sb.from('jira_tickets')
    .update({ has_pr: nums.length > 0, pr_numbers: nums })
    .eq('id', t.id);
  if (e) { console.error(t.jira_key, e.message); process.exit(1); }
  if (nums.length > 0) flagged++; else cleared++;
}
console.log('has_pr set on', flagged, 'tickets; cleared on', cleared);

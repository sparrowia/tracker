// 4.11d → Phase 5 as 5.4 DC Hours certificate template
// 4.11g → Phase 8 as 8.5 Certificate reconciliation hook
// Renumber Phase 5 children: QA → 5.5, Launch → 5.6, Runbook → 5.7
// Re-date 5.7 (runbook) to 2026-07-20 (post-launch)

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PHASE_5_ROLLUP = 'eaa64ab6-8ddc-4438-8f59-adf8da962778';
const PHASE_8_ROLLUP = '6086f9ca-c3ac-4e3e-9eba-e409258d3d66';

const ID_411D = '57101b89-7fec-476e-8a93-e8d6674874bf';
const ID_411G = 'a03f1f8a-b65f-4a96-a685-6aaa8e9aff45';
const ID_5_4_QA = '3ca09a56-e01b-45df-8aea-112b33a5dd3a';
const ID_5_5_LAUNCH = '94d25ebb-6795-421e-a7d0-378091a15b13';
const ID_5_6_RUNBOOK = '65ec16d9-c98e-4231-b4f9-681f4821e78c';

const updates = [
  // 4.11d → Phase 5 as 5.4 DC Hours certificate template
  {
    id: ID_411D,
    parent_id: PHASE_5_ROLLUP,
    sort_order: 40,
    title: '5.4 DC Hours certificate template',
    due_date: '2026-07-06',
  },
  // QA renumber 5.4 → 5.5
  {
    id: ID_5_4_QA,
    sort_order: 50,
    title: '5.5 DC Hours QA',
  },
  // Launch renumber 5.5 → 5.6
  {
    id: ID_5_5_LAUNCH,
    sort_order: 60,
    title: '5.6 DC Hours launch',
  },
  // Runbook renumber 5.6 → 5.7, re-date to post-launch
  {
    id: ID_5_6_RUNBOOK,
    sort_order: 70,
    title: '[POST-MVP] 5.7 Brand porting template + runbook',
    due_date: '2026-07-20',
  },
  // 4.11g → Phase 8 as 8.5 Certificate reconciliation hook
  {
    id: ID_411G,
    parent_id: PHASE_8_ROLLUP,
    sort_order: 50,
    title: '[POST-MVP] 8.5 Certificate reconciliation hook',
    due_date: '2026-08-30',
  },
];

for (const u of updates) {
  const { id, ...patch } = u;
  const { data, error } = await sb.from('action_items').update(patch).eq('id', id).select('title, parent_id, sort_order, due_date');
  console.log(error ? 'ERROR ' + JSON.stringify(error) : `updated: ${JSON.stringify(data?.[0])}`);
}

console.log('\n--- Phase 5 children after ---');
const { data: p5children } = await sb.from('action_items').select('title, sort_order, due_date, parent_id').eq('parent_id', PHASE_5_ROLLUP).order('sort_order');
for (const c of p5children) console.log(`  sort=${c.sort_order} due=${c.due_date} | ${c.title}`);

console.log('\n--- Phase 8 children after ---');
const { data: p8children } = await sb.from('action_items').select('title, sort_order, due_date, parent_id').eq('parent_id', PHASE_8_ROLLUP).order('sort_order');
for (const c of p8children) console.log(`  sort=${c.sort_order} due=${c.due_date} | ${c.title}`);

console.log('\n--- Phase 4E children after ---');
const PHASE_4E_ROLLUP = '97110f0d-243d-489a-a765-4641ef60a06a';
const { data: p4echildren } = await sb.from('action_items').select('title, sort_order, due_date, status').eq('parent_id', PHASE_4E_ROLLUP).order('sort_order');
for (const c of p4echildren) console.log(`  sort=${c.sort_order} due=${c.due_date} status=${c.status} | ${c.title}`);

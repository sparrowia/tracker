import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

const rollups = [
  'Phase 5b: Second Brand Launch — VetPrep',
  'Phase 7: Admin Panel (admin.edcet.com)',
  'Phase 5: First Brand Launch — DC Hours',
  'Phase 4D: CMS + Course Sync',
  'End-to-End Testing: Pre-Launch',
  'Code Review Gate 1: Phases 2-4C',
  '[POST-MVP] Phase 6: Cross-Brand Dashboard',
  '[POST-MVP] Phase 8: Sync Layer — Bulk Reconciliation',
];

for (const t of rollups) {
  const { data: parent } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', t).maybeSingle();
  if (!parent) { console.log(`-- NOT FOUND: ${t}\n`); continue; }
  const { data: kids } = await sb.from('action_items')
    .select('id, title, status, sort_order')
    .eq('parent_id', parent.id)
    .order('sort_order');
  console.log(`-- ${t} (${kids.length}):`);
  for (const k of kids) console.log(`     [${k.status}] ${k.title}`);
  console.log('');
}

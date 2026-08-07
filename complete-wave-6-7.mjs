import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id').eq('slug', 'working-ux').single();
const PID = project.id;

const { data: rollups } = await sb.from('action_items')
  .select('id, title')
  .eq('project_id', PID)
  .in('title', [
    'Wave 6 — Dashboard depth (UX-only — show HOW it functions, no real backend)',
    'Wave 7 — Optional & integrative (UX-only)',
  ]);

for (const rollup of rollups) {
  // Mark all children completed
  const { error: kidErr } = await sb.from('action_items')
    .update({ status: 'complete' })
    .eq('parent_id', rollup.id)
    .eq('status', 'pending');
  if (kidErr) throw kidErr;
  // Mark rollup completed
  const { error: rErr } = await sb.from('action_items')
    .update({ status: 'complete' })
    .eq('id', rollup.id);
  if (rErr) throw rErr;
  console.log(`completed: ${rollup.title.slice(0, 50)}...`);
}

// Re-fetch and print
for (const rollup of rollups) {
  const { data: kids } = await sb.from('action_items')
    .select('id, title, status')
    .eq('parent_id', rollup.id)
    .order('sort_order');
  console.log(`\n${rollup.title.slice(0,30)} children:`);
  for (const k of kids) {
    console.log(`  [${k.status}] ${k.title}`);
  }
}

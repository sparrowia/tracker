import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

// Pull the parent rollups that are in_progress + their kids
const inProgressParents = ['Phase 4B: Cart + Checkout + Enrollment', 'Phase 4D: CMS + Course Sync', 'Phase 5: First Brand Launch — DC Hours'];

for (const parentTitle of inProgressParents) {
  const { data: parent } = await sb.from('action_items')
    .select('id, title, status').eq('project_id', PID).eq('title', parentTitle).single();
  console.log(`\n=== ${parent.title} (${parent.status}) ===`);
  const { data: kids } = await sb.from('action_items')
    .select('id, title, status, sort_order')
    .eq('parent_id', parent.id)
    .order('sort_order', { ascending: true });
  for (const k of kids) {
    console.log(`  [${k.status.padEnd(11)}] ${k.title}`);
  }
}

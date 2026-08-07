import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();

const { data: items, error } = await sb.from('action_items')
  .select('id, title, due_date')
  .eq('project_id', project.id)
  .like('title', '%POST-MVP%')
  .not('due_date', 'is', null);
if (error) throw error;

console.log(`Clearing due_date on ${items.length} POST-MVP items:`);
for (const i of items) {
  await sb.from('action_items').update({ due_date: null }).eq('id', i.id);
  console.log(`  ✓ ${i.title} (was ${i.due_date})`);
}

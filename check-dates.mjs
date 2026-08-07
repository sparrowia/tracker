import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();

const { data: items } = await sb.from('action_items')
  .select('id, title, due_date, first_flagged_at, status, sort_order')
  .eq('project_id', project.id)
  .like('title', '%POST-MVP%')
  .order('sort_order');
for (const i of items) {
  console.log(`  due=${i.due_date ?? '—'} flagged=${i.first_flagged_at ?? '—'} ${i.title}`);
}

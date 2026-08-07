import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

const { data: top } = await sb.from('action_items')
  .select('id, title, status, sort_order')
  .eq('project_id', PID).is('parent_id', null)
  .order('sort_order');

async function dump(id, depth) {
  const { data: kids } = await sb.from('action_items')
    .select('id, title, status, sort_order')
    .eq('parent_id', id)
    .order('sort_order');
  for (const k of kids) {
    console.log(`${'    '.repeat(depth)}[${k.status.padEnd(11)}] ${k.title}`);
    await dump(k.id, depth + 1);
  }
}

for (const t of top) {
  console.log(`\n[${t.status.padEnd(11)}] sort=${t.sort_order} ${t.title}`);
  await dump(t.id, 1);
}

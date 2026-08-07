import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: projects } = await sb.from('projects').select('id, slug, name, org_id').order('name');
console.log('PROJECTS:');
for (const p of projects) {
  const { count } = await sb.from('action_items').select('*', { count: 'exact', head: true }).eq('project_id', p.id);
  console.log(`  ${p.slug.padEnd(30)} ${p.name.padEnd(40)} ${count} items`);
}

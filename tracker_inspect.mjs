import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#')).reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const { data: items } = await sb.from('action_items').select('id, title, parent_id, sort_order, created_at, due_date').eq('project_id', project.id).is('parent_id', null);

console.log('Top-level items by sort_order then created_at:');
const sorted = items.sort((a, b) => (a.sort_order - b.sort_order) || a.created_at.localeCompare(b.created_at));
for (const it of sorted) {
  console.log(`  sort=${String(it.sort_order).padStart(4)} due=${it.due_date || '----------'} created=${it.created_at.slice(0,10)} ${it.title}`);
}

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id, name').eq('slug', 'internal-development').single();
console.log(`PROJECT: ${project.name}\n`);

const { data: items } = await sb.from('action_items')
  .select('id, parent_id, title, status, sort_order, resolved_at')
  .eq('project_id', project.id);

const byParent = new Map();
for (const it of items) {
  const k = it.parent_id ?? 'root';
  if (!byParent.has(k)) byParent.set(k, []);
  byParent.get(k).push(it);
}

// First show TOP-LEVEL items only (parent_id = null), to see the structure.
const top = (byParent.get('root') ?? []).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));
console.log(`Top-level items (${top.length}):\n`);
for (const t of top) {
  const kidCount = (byParent.get(t.id) ?? []).length;
  const archived = t.resolved_at ? '🗄️' : '';
  console.log(`  [${t.status}] sort=${t.sort_order} ${t.title.slice(0,80)} (children=${kidCount}) ${archived}`);
}

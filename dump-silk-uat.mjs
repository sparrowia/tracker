import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id, slug, name').eq('slug', 'silk-uat').single();
console.log(`PROJECT: ${project.name} (${project.slug})\n`);

const { data: items } = await sb.from('action_items')
  .select('id, parent_id, title, status, priority, due_date, sort_order, resolved_at')
  .eq('project_id', project.id)
  .order('sort_order', { ascending: true });

const byParent = new Map();
for (const it of items) {
  const k = it.parent_id ?? 'root';
  if (!byParent.has(k)) byParent.set(k, []);
  byParent.get(k).push(it);
}

function walk(parent, depth) {
  const kids = (byParent.get(parent) ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const k of kids) {
    const indent = '  '.repeat(depth);
    const archived = k.resolved_at ? '🗄️' : '';
    console.log(`${indent}[${k.status}] ${k.title} ${archived}`);
    walk(k.id, depth + 1);
  }
}
walk('root', 0);

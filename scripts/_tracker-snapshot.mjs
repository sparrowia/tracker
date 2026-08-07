import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id, slug, name').eq('slug', 'internal-development').single();
console.log(`Project: ${project.name} (${project.id})`);

// Get all action items for this project, look at counts by status
const { data: items, error } = await sb.from('action_items')
  .select('id, title, status, parent_id, sort_order, resolved_at, updated_at')
  .eq('project_id', project.id)
  .order('sort_order', { ascending: true });

if (error) { console.error(error); process.exit(1); }

console.log(`\nTotal items: ${items.length}`);

const byStatus = items.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
console.log('By status:', byStatus);

const archivedCount = items.filter(i => i.resolved_at).length;
console.log(`Archived (resolved_at set): ${archivedCount}`);

// Top-level items (parent_id null)
const topLevel = items.filter(i => !i.parent_id);
console.log(`\nTop-level items: ${topLevel.length}`);
console.log('---');
for (const i of topLevel) {
  const archived = i.resolved_at ? ' [ARCH]' : '';
  console.log(`[${i.status}]${archived} ${i.title}`);
}

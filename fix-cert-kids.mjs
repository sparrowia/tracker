import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();

const fixes = [
  ['4.11a packages/certificates package scaffold',           '8.11a packages/certificates package scaffold', 0],
  ['4.11b DB migration: CE-compliance fields on certificates', '8.11b DB migration: CE-compliance fields on certificates', 10],
];
for (const [oldT, newT, sort] of fixes) {
  const { data: row } = await sb.from('action_items').select('id').eq('project_id', project.id).eq('title', oldT).maybeSingle();
  if (!row) { console.log(`  SKIP: ${oldT}`); continue; }
  await sb.from('action_items').update({ title: newT, sort_order: sort }).eq('id', row.id);
  console.log(`  ✓ ${oldT} → ${newT}`);
}

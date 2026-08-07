import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

const { data: top } = await sb.from('action_items')
  .select('id, title, due_date, first_flagged_at, sort_order, status')
  .eq('project_id', PID).is('parent_id', null).order('sort_order');

for (const t of top) {
  const { data: kids } = await sb.from('action_items')
    .select('id, title, due_date, first_flagged_at')
    .eq('parent_id', t.id);
  const childDues = kids.map(k => k.due_date).filter(Boolean).sort();
  const childFlagged = kids.map(k => k.first_flagged_at).filter(Boolean).sort();
  const childMinDue = childDues[0] ?? null;
  const childMaxDue = childDues[childDues.length - 1] ?? null;
  const childMinFlag = childFlagged[0] ?? null;
  const childMaxFlag = childFlagged[childFlagged.length - 1] ?? null;
  console.log(`\n${t.title}`);
  console.log(`  parent: due=${t.due_date ?? '—'} flagged=${(t.first_flagged_at??'—').slice(0,10)}`);
  console.log(`  child range: due ${childMinDue ?? '—'} → ${childMaxDue ?? '—'}, flagged ${(childMinFlag??'—').slice(0,10)} → ${(childMaxFlag??'—').slice(0,10)}`);
  console.log(`  ${kids.length} children`);
}

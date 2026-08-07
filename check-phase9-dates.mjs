import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();

for (const phaseTitle of ['Phase 9: Admin Panel', 'Phase 10: Pre-Launch Validation', 'Phase 3: Integration Packages']) {
  const { data: parent } = await sb.from('action_items').select('id, due_date, first_flagged_at').eq('project_id', project.id).eq('title', phaseTitle).is('parent_id', null).single();
  const { data: kids } = await sb.from('action_items')
    .select('title, due_date, first_flagged_at, status')
    .eq('parent_id', parent.id)
    .order('sort_order');
  console.log(`\n${phaseTitle}  parent_due=${parent.due_date}`);
  for (const k of kids) {
    console.log(`  due=${k.due_date ?? '—'} flag=${(k.first_flagged_at??'—').slice(0,10)} [${k.status}] ${k.title}`);
  }
}

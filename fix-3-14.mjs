import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

// 3.14 was completed May 1 per Phase 3 close-out (commit 65bf63e). Forward-projected
// 2026-07-09 due was set when scope was unclear; align to actual completion timeline.
const { data: row } = await sb.from('action_items').select('id, due_date').eq('project_id', PID).eq('title', '3.14 TI webhook auth — URL-embedded secret').single();
await sb.from('action_items').update({ due_date: '2026-05-01' }).eq('id', row.id);
console.log(`✓ 3.14 due ${row.due_date} → 2026-05-01`);

// Recompute Phase 3 parent
const { data: phase3 } = await sb.from('action_items').select('id, due_date').eq('project_id', PID).eq('title', 'Phase 3: Integration Packages').is('parent_id', null).single();
const { data: kids } = await sb.from('action_items').select('due_date').eq('parent_id', phase3.id).not('due_date', 'is', null);
const maxDue = kids.map(k => k.due_date).sort().pop();
await sb.from('action_items').update({ due_date: maxDue }).eq('id', phase3.id);
console.log(`✓ Phase 3 parent: ${phase3.due_date} → ${maxDue}`);

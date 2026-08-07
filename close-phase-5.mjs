import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

// Step 1: Move 5.10d → Phase 9, rename to 9.10d
const { data: phase9 } = await sb.from('action_items')
  .select('id').eq('project_id', PID).eq('title', 'Phase 9: Admin Panel').is('parent_id', null).single();

const { data: bulkPromo } = await sb.from('action_items')
  .select('id').eq('project_id', PID).eq('title', '5.10d Bulk promo code generation').single();

await sb.from('action_items').update({
  parent_id: phase9.id,
  title: '9.10d Bulk promo code generation (admin UI)',
  sort_order: 40,
}).eq('id', bulkPromo.id);
console.log('✓ Moved 5.10d → 9.10d Bulk promo code generation (admin UI), under Phase 9');

// Step 2: Validate 5.10a — flip needs_verification → complete
const { data: extensions } = await sb.from('action_items')
  .select('id, status').eq('project_id', PID).eq('title', '5.10a Self-serve subscription extensions').single();
await sb.from('action_items').update({ status: 'complete' }).eq('id', extensions.id);
console.log(`✓ 5.10a Self-serve subscription extensions: ${extensions.status} → complete`);

// Step 3: Verify all Phase 5 children are complete, flip Phase 5 → complete
const { data: phase5 } = await sb.from('action_items')
  .select('id').eq('project_id', PID).eq('title', 'Phase 5: Cart + Checkout + Enrollment').is('parent_id', null).single();
const { data: phase5Kids } = await sb.from('action_items')
  .select('id, title, status').eq('parent_id', phase5.id);
const open = phase5Kids.filter(k => k.status !== 'complete');
if (open.length === 0) {
  await sb.from('action_items').update({ status: 'complete' }).eq('id', phase5.id);
  console.log(`✓ Phase 5 has ${phase5Kids.length}/${phase5Kids.length} complete → flipped to complete`);
} else {
  console.log(`⚠ Phase 5 still has ${open.length} open: ${open.map(o=>o.title).join(', ')}`);
}

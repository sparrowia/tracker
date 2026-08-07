import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

async function findByTitle(title) {
  const { data } = await sb.from('action_items').select('id, due_date').eq('project_id', PID).eq('title', title).maybeSingle();
  return data;
}

// 1. Realign relocated children's due dates with their NEW parent's window.
const relocations = [
  ['9.10d Bulk promo code generation (admin UI)', '2026-08-07', 'Phase 9 admin UI window'],
  ['E2E: CE Purchase Chain — full BC → SF → TI → Supabase script', '2026-06-19', 'matches Phase 10 E2E batch'],
];
console.log('-- Relocations: align due_date with new parent --');
for (const [title, newDue, why] of relocations) {
  const row = await findByTitle(title);
  if (!row) { console.log(`  SKIP: ${title}`); continue; }
  await sb.from('action_items').update({ due_date: newDue }).eq('id', row.id);
  console.log(`  ✓ ${title}  ${row.due_date} → ${newDue}  (${why})`);
}

// 2. Clear any remaining POST-MVP child due dates.
const { data: postMvp } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', 'Post-MVP').is('parent_id', null).single();
const { data: postKids } = await sb.from('action_items').select('id, title, due_date').eq('parent_id', postMvp.id).not('due_date', 'is', null);
console.log('\n-- Clearing residual POST-MVP child dates --');
for (const k of postKids) {
  await sb.from('action_items').update({ due_date: null }).eq('id', k.id);
  console.log(`  ✓ cleared due_date on: ${k.title}  (was ${k.due_date})`);
}

// 3. Recompute each parent rollup's due_date = max(non-null child due).
console.log('\n-- Recomputing parent due_date = MAX(child due_dates) --');
const { data: parents } = await sb.from('action_items')
  .select('id, title, due_date').eq('project_id', PID).is('parent_id', null).order('sort_order');
for (const p of parents) {
  const { data: kids } = await sb.from('action_items').select('due_date').eq('parent_id', p.id).not('due_date', 'is', null);
  const maxDue = kids.map(k => k.due_date).sort().pop();
  if (!maxDue) {
    if (p.due_date) {
      await sb.from('action_items').update({ due_date: null }).eq('id', p.id);
      console.log(`  ✓ ${p.title}: ${p.due_date} → null  (no dated children)`);
    }
    continue;
  }
  if (p.due_date !== maxDue) {
    await sb.from('action_items').update({ due_date: maxDue }).eq('id', p.id);
    console.log(`  ✓ ${p.title}: ${p.due_date ?? '—'} → ${maxDue}`);
  }
}

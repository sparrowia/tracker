import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

const { data: postMvp } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', 'Post-MVP').is('parent_id', null).single();
const POST = postMvp.id;

// Plan: flatten each sub-rollup's children directly under Post-MVP, with a section prefix.
// Sub-rollups with no children (CR2, Perf Monitoring, Algolia) move to Post-MVP as-is, no prefix.
const flattenPlan = [
  // [sub-rollup title, prefix to prepend to leaves, base sort_order, drop-rollup-after]
  ['CMS Integration',                       'CMS Integration: ',          10,   true],
  ['Cross-Brand Dashboard',                  'Cross-Brand Dashboard: ',   30,   true],
  ['Admin Panel — Broader Functionality',    'Admin Panel: ',             50,   true],
  ['Sync Layer — Bulk Reconciliation',       'Sync Layer: ',             100,   true],
  ['Brand Porting Runbook',                  '',                         230,   true],   // single child, no prefix; becomes standalone
];

for (const [rollupTitle, prefix, baseSort, dropRollup] of flattenPlan) {
  const { data: rollup } = await sb.from('action_items')
    .select('id').eq('project_id', PID).eq('title', rollupTitle).eq('parent_id', POST).maybeSingle();
  if (!rollup) { console.log(`  SKIP rollup: ${rollupTitle}`); continue; }
  const { data: kids } = await sb.from('action_items')
    .select('id, title, sort_order').eq('parent_id', rollup.id).order('sort_order');
  let i = 0;
  for (const k of kids) {
    const newTitle = prefix + k.title;
    await sb.from('action_items').update({
      parent_id: POST,
      title: newTitle,
      sort_order: baseSort + i,
    }).eq('id', k.id);
    console.log(`  ✓ ${k.title} → ${newTitle} (sort=${baseSort + i})`);
    i++;
  }
  if (dropRollup) {
    await sb.from('action_items').delete().eq('id', rollup.id);
    console.log(`    ✓ dropped now-empty rollup: ${rollupTitle}`);
  }
}

// Reorder the remaining standalone Post-MVP items (CR2, Perf Monitoring, Algolia)
const standalones = [
  ['Code Review Gate 2',          200],
  ['Performance Monitoring',      210],
  ['Algolia search enhancement', 220],
];
for (const [t, sort] of standalones) {
  const { data: row } = await sb.from('action_items')
    .select('id').eq('project_id', PID).eq('title', t).eq('parent_id', POST).maybeSingle();
  if (!row) { console.log(`  SKIP standalone: ${t}`); continue; }
  await sb.from('action_items').update({ sort_order: sort }).eq('id', row.id);
  console.log(`  ✓ standalone: ${t} (sort=${sort})`);
}

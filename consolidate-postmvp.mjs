import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id, org_id').eq('slug', 'internal-development').single();
const PID = project.id;
const ORG = project.org_id;

// Step 1: create the Post-MVP parent rollup (or reuse if it already exists)
const existingParent = await sb.from('action_items')
  .select('id').eq('project_id', PID).eq('title', 'Post-MVP').is('parent_id', null).maybeSingle();

let parentId = existingParent.data?.id;
if (!parentId) {
  const { data, error } = await sb.from('action_items').insert({
    org_id: ORG, project_id: PID,
    title: 'Post-MVP',
    description: 'Items deferred until after MVP launch (DC Hours + PrepPE live). No committed dates; sequenced post-MVP UAT.',
    status: 'pending', priority: 'medium', sort_order: 1500,
  }).select('id').single();
  if (error) throw error;
  parentId = data.id;
  console.log(`✓ Created Post-MVP parent rollup (id=${parentId})`);
} else {
  console.log(`✓ Post-MVP parent already exists (id=${parentId})`);
}

// Step 2: reparent the 8 existing POST-MVP rollups + drop the [POST-MVP] prefix
const subRollups = [
  ['[POST-MVP] CMS Integration',                          'CMS Integration',                       10],
  ['[POST-MVP] Cross-Brand Dashboard',                     'Cross-Brand Dashboard',                 20],
  ['[POST-MVP] Admin Panel — Broader Functionality',       'Admin Panel — Broader Functionality',   30],
  ['[POST-MVP] Sync Layer — Bulk Reconciliation',          'Sync Layer — Bulk Reconciliation',      40],
  ['[POST-MVP] Code Review Gate 2',                         'Code Review Gate 2',                    50],
  ['[POST-MVP] Performance Monitoring',                     'Performance Monitoring',                60],
  ['[POST-MVP] Algolia search enhancement',                 'Algolia search enhancement',            70],
  ['[POST-MVP] Brand Porting Runbook',                      'Brand Porting Runbook',                 80],
];
for (const [oldT, newT, sort] of subRollups) {
  const { data: row } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', oldT).maybeSingle();
  if (!row) { console.log(`  SKIP: ${oldT}`); continue; }
  await sb.from('action_items').update({ parent_id: parentId, title: newT, sort_order: sort }).eq('id', row.id);
  console.log(`  ✓ ${oldT}\n      → ${newT} (under Post-MVP)`);
}

// Step 3: drop the [POST-MVP] prefix from leaf children since the hierarchy makes it redundant
const leafRenames = [
  ['[POST-MVP] CMS platform decision',         'CMS platform decision'],
  ['[POST-MVP] CMS integration',               'CMS integration'],
  ['[POST-MVP] Dashboard package',             'Dashboard package'],
  ['[POST-MVP] Embed in storefront',           'Embed in storefront'],
  ['[POST-MVP] Customer 360',                  'Customer 360'],
  ['[POST-MVP] Brand configuration view',      'Brand configuration view'],
  ['[POST-MVP] Reporting',                     'Reporting'],
  ['[POST-MVP] Operational tools',             'Operational tools'],
  ['[POST-MVP] Support ticket visibility',     'Support ticket visibility'],
  ['[POST-MVP] BenchPrep → Snowflake reconciliation', 'BenchPrep → Snowflake reconciliation'],
  ['[POST-MVP] TI → BI Connector reconciliation',     'TI → BI Connector reconciliation'],
  ['[POST-MVP] Salesforce data sync',          'Salesforce data sync'],
  ['[POST-MVP] Reconciliation monitoring',     'Reconciliation monitoring'],
  ['[POST-MVP] Certificate reconciliation hook','Certificate reconciliation hook'],
];
for (const [oldT, newT] of leafRenames) {
  const { data: row } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', oldT).maybeSingle();
  if (!row) { console.log(`  SKIP leaf: ${oldT}`); continue; }
  await sb.from('action_items').update({ title: newT }).eq('id', row.id);
  console.log(`  ✓ leaf: ${oldT} → ${newT}`);
}

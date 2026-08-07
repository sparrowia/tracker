import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

// --- Rollup rename plan ---
const renames = [
  // [old title, new title, new sort_order]
  ['Phase 4A: App Shell + Auth + Browsing',                   'Phase 4: App Shell + Auth + Browsing',          400],
  ['Phase 4B: Cart + Checkout + Enrollment',                  'Phase 5: Cart + Checkout + Enrollment',         500],
  ['Phase 4C: Account + Support',                             'Phase 6: Account + Support',                    600],
  ['Phase 4D: CMS + Course Sync',                             'Phase 7: Catalog Sync (TI → BC)',               700],
  ['Phase 4E: Certificate Generation Pipeline',               'Phase 8: Certificate Generation Pipeline',      800],
  ['Phase 7: Admin Panel (admin.edcet.com)',                  'Phase 9: Admin Panel (admin.edcet.com)',        900],
  ['Code Review Gate 1: Phases 2-4C',                         'Phase 10: Pre-Launch Validation',              1000],
  ['Phase 5: First Brand Launch — DC Hours',                  'Phase 11: First Brand Launch — DC Hours',      1100],
  ['Phase 5b: Second Brand Launch — VetPrep',                 'Phase 12: Second Brand Launch — PrepPE',       1200],
  // POST-MVP — push beyond 1200, drop "Phase X:" prefix from title
  ['[POST-MVP] Phase 6: Cross-Brand Dashboard',               '[POST-MVP] Cross-Brand Dashboard',             2000],
  ['[POST-MVP] Phase 8: Sync Layer — Bulk Reconciliation',    '[POST-MVP] Sync Layer — Bulk Reconciliation',  2100],
  ['[POST-MVP] Code Review Gate 2: Phases 5-8',               '[POST-MVP] Code Review Gate 2',                2200],
  // E2E folds INTO Pre-Launch Validation (Phase 10) — but as separate rollup, mark complete-on-merge later
  ['End-to-End Testing: Pre-Launch',                          '[MERGED→Phase 10] End-to-End Testing: Pre-Launch — to be folded into Phase 10', 1050],
];

console.log('PROPOSED ROLLUP RENAMES:\n');
for (const [oldTitle, newTitle, newSort] of renames) {
  const { data } = await sb.from('action_items')
    .select('id, status, sort_order')
    .eq('project_id', PID).eq('title', oldTitle).maybeSingle();
  if (!data) {
    console.log(`  [NOT FOUND]  ${oldTitle}`);
    continue;
  }
  console.log(`  ${oldTitle}`);
  console.log(`    → ${newTitle}`);
  console.log(`    sort_order: ${data.sort_order} → ${newSort}\n`);
}

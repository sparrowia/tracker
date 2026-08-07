// One-shot migration: renumber Internal Development phases per the
// "stop at Phase 12 / no letter suffixes" structure approved 2026-05-07.
//
// Layout target:
//   Phase 1  Monorepo Scaffold (no change)
//   Phase 2  DB + Auth + Brand Config (no change)
//   Phase 3  Integration Packages (no change)
//   Phase 4  App Shell + Auth + Browsing (was 4A)
//   Phase 5  Cart + Checkout + Enrollment (was 4B)
//   Phase 6  Account + Support (was 4C)
//   Phase 7  Catalog Sync (TI → BC) (was 4D, CMS pulled out to POST-MVP)
//   Phase 8  Certificate Generation Pipeline (was 4E)
//   Phase 9  Admin Panel (was old Phase 7; POST-MVP children pulled out)
//   Phase 10 Pre-Launch Validation (CR1 + E2E folded together)
//   Phase 11 First Brand Launch — DC Hours (was Phase 5)
//   Phase 12 Second Brand Launch — PrepPE (was Phase 5b — VetPrep specifics dropped)
//
// POST-MVP (no phase number, sort >= 2000): CMS, Cross-Brand, Sync Layer,
// Brand Porting Runbook, broader Admin functionality, Performance Monitoring,
// Algolia, CR2.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id, org_id').eq('slug', 'internal-development').single();
const PID = project.id;
const ORG = project.org_id;

async function findRollupId(title) {
  const { data } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', title).is('parent_id', null).maybeSingle();
  return data?.id ?? null;
}
async function findItemByTitle(title) {
  const { data } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', title).maybeSingle();
  return data?.id ?? null;
}
async function update(id, patch) {
  const { error } = await sb.from('action_items').update(patch).eq('id', id);
  if (error) throw error;
}
async function insert(row) {
  const { data, error } = await sb.from('action_items').insert({ org_id: ORG, project_id: PID, ...row }).select('id').single();
  if (error) throw error;
  return data.id;
}
async function deleteById(id) {
  const { error } = await sb.from('action_items').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Step 1: Rename rollups + new sort_order
// ============================================================
const rollupRenames = [
  ['Phase 4A: App Shell + Auth + Browsing',                   'Phase 4: App Shell + Auth + Browsing',          400],
  ['Phase 4B: Cart + Checkout + Enrollment',                  'Phase 5: Cart + Checkout + Enrollment',         500],
  ['Phase 4C: Account + Support',                             'Phase 6: Account + Support',                    600],
  ['Phase 4D: CMS + Course Sync',                             'Phase 7: Catalog Sync (TI → BC)',               700],
  ['Phase 4E: Certificate Generation Pipeline',               'Phase 8: Certificate Generation Pipeline',      800],
  ['Phase 7: Admin Panel (admin.edcet.com)',                  'Phase 9: Admin Panel',                          900],
  ['Code Review Gate 1: Phases 2-4C',                         'Phase 10: Pre-Launch Validation',              1000],
  ['Phase 5: First Brand Launch — DC Hours',                  'Phase 11: First Brand Launch — DC Hours',      1100],
  ['Phase 5b: Second Brand Launch — VetPrep',                 'Phase 12: Second Brand Launch — PrepPE',       1200],
  ['[POST-MVP] Phase 6: Cross-Brand Dashboard',               '[POST-MVP] Cross-Brand Dashboard',             2000],
  ['[POST-MVP] Phase 8: Sync Layer — Bulk Reconciliation',    '[POST-MVP] Sync Layer — Bulk Reconciliation',  2100],
  ['[POST-MVP] Code Review Gate 2: Phases 5-8',               '[POST-MVP] Code Review Gate 2',                2200],
  ['Performance Monitoring - Visibility in Dashboard',        '[POST-MVP] Performance Monitoring',            2300],
  ['[POST-MVP] Algolia search enhancement for CE catalogs',   '[POST-MVP] Algolia search enhancement',        2400],
];
console.log('-- Step 1: Renaming rollups --');
for (const [oldT, newT, sort] of rollupRenames) {
  const id = await findRollupId(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT.slice(0,55)}\n      → ${newT}`);
}

// ============================================================
// Step 2: Fold E2E rollup INTO Phase 10
// ============================================================
console.log('\n-- Step 2: Fold E2E into Phase 10 --');
const phase10Id = await findRollupId('Phase 10: Pre-Launch Validation');
const e2eRollupId = await findRollupId('End-to-End Testing: Pre-Launch');
if (e2eRollupId && phase10Id) {
  // Get all E2E children, reparent to Phase 10 with sort_order 1100+
  const { data: e2eKids } = await sb.from('action_items')
    .select('id, sort_order').eq('parent_id', e2eRollupId).order('sort_order');
  let i = 0;
  for (const k of e2eKids) {
    await update(k.id, { parent_id: phase10Id, sort_order: 1100 + i * 10 });
    i++;
  }
  // Renumber CR1 children sort_order to 1000-1099 range so they sort first
  const { data: crKids } = await sb.from('action_items')
    .select('id, sort_order').eq('parent_id', phase10Id).order('sort_order').limit(20);
  let j = 0;
  for (const k of crKids) {
    if (k.sort_order >= 1100) continue; // already-moved E2E kids
    await update(k.id, { sort_order: 1000 + j * 10 });
    j++;
  }
  // Delete the now-empty E2E rollup
  await deleteById(e2eRollupId);
  console.log(`  ✓ Moved ${e2eKids.length} E2E children to Phase 10; deleted E2E rollup`);
}

// ============================================================
// Step 3: Phase 9 (Admin) — pull POST-MVP children into a new rollup
// ============================================================
console.log('\n-- Step 3: Pull broader Admin work to POST-MVP --');
const phase9Id = await findRollupId('Phase 9: Admin Panel');
let postMvpAdminId = await findRollupId('[POST-MVP] Admin Panel — Broader Functionality');
if (!postMvpAdminId) {
  postMvpAdminId = await insert({
    title: '[POST-MVP] Admin Panel — Broader Functionality',
    description: 'Customer 360, brand config view, reporting, operational tools, support ticket visibility. MVP admin = auth + feature flag toggle + deploy (Phase 9).',
    status: 'pending', priority: 'medium', sort_order: 2050,
  });
}
const adminPostMvpTitles = [
  '[POST-MVP] 7.2 Customer 360',
  '[POST-MVP] 7.4 Brand configuration view',
  '[POST-MVP] 7.5 Reporting',
  '[POST-MVP] 7.6 Operational tools',
  '[POST-MVP] 7.7 Support ticket visibility',
];
let s = 10;
for (const t of adminPostMvpTitles) {
  const id = await findItemByTitle(t);
  if (!id) { console.log(`  SKIP (not found): ${t}`); continue; }
  // Drop "7.X" from title
  const newTitle = t.replace(/^\[POST-MVP\] 7\.\d+ /, '[POST-MVP] ');
  await update(id, { parent_id: postMvpAdminId, title: newTitle, sort_order: s });
  s += 10;
  console.log(`  ✓ ${t}\n      → ${newTitle}`);
}

// Renumber Phase 9 remaining children: 7.1 → 9.1, 7.3 → 9.3, 7.8 → 9.8 (preserve inner per Matt's "B")
console.log('\n-- Step 4: Phase 9 children rename --');
const phase9ChildRenames = [
  ['7.1 Admin auth', '9.1 Admin auth', 10],
  ['7.3 Feature flag management', '9.3 Feature flag management', 30],
  ['7.8 Admin deployment', '9.8 Admin deployment', 80],
];
for (const [oldT, newT, sort] of phase9ChildRenames) {
  const id = await findItemByTitle(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT} → ${newT}`);
}

// ============================================================
// Step 5: Phase 11 (DC Hours) children rename: 5.X → 11.X
// ============================================================
console.log('\n-- Step 5: Phase 11 DC Hours children rename --');
const phase11Renames = [
  ['5.1 DC Hours brand configuration',         '11.1 DC Hours brand configuration', 10],
  ['5.2 DC Hours Vercel deployment',           '11.2 DC Hours Vercel deployment', 20],
  ['5.3 DC Hours content + design',            '11.3 DC Hours content + design', 30],
  ['5.4 DC Hours certificate template',        '11.4 DC Hours certificate template', 40],
  ['5.5 DC Hours QA',                          '11.5 DC Hours QA', 50],
  ['5.6 DC Hours launch',                      '11.6 DC Hours launch', 60],
];
for (const [oldT, newT, sort] of phase11Renames) {
  const id = await findItemByTitle(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT} → ${newT}`);
}

// Move 5.7 Brand porting runbook to a new POST-MVP rollup
let postMvpRunbookId = await findRollupId('[POST-MVP] Brand Porting Runbook');
if (!postMvpRunbookId) {
  postMvpRunbookId = await insert({
    title: '[POST-MVP] Brand Porting Runbook',
    description: 'Documents the repeatable process for porting existing or launching new brands on the unified platform. Post-DC-Hours deliverable.',
    status: 'pending', priority: 'medium', sort_order: 2500,
  });
}
const runbookId = await findItemByTitle('[POST-MVP] 5.7 Brand porting template + runbook');
if (runbookId) {
  await update(runbookId, { parent_id: postMvpRunbookId, title: 'Brand porting template + runbook', sort_order: 10 });
  console.log(`  ✓ 5.7 Brand porting runbook → POST-MVP rollup`);
}

// ============================================================
// Step 6: Phase 12 (PrepPE) — drop VetPrep specifics, renumber
// ============================================================
console.log('\n-- Step 6: Phase 12 PrepPE children — drop VetPrep specifics --');
// Delete 5b.3 design pull-over from edcetera_vetprep — doesn't apply to PrepPE
const designPullId = await findItemByTitle('5b.3 VetPrep design pull-over from existing repo');
if (designPullId) {
  await deleteById(designPullId);
  console.log(`  ✓ deleted: 5b.3 VetPrep design pull-over`);
}
// Rename remaining (preserve inner per "B")
const phase12Renames = [
  ['5b.1 VetPrep brand configuration', '12.1 Brand configuration', 10],
  ['5b.2 VetPrep Vercel deployment',   '12.2 Vercel deployment', 20],
  ['5b.4 VetPrep QA',                  '12.4 QA', 40],
  ['5b.5 VetPrep launch',              '12.5 Launch', 50],
];
for (const [oldT, newT, sort] of phase12Renames) {
  const id = await findItemByTitle(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT} → ${newT}`);
}

// ============================================================
// Step 7: Phase 7 (Catalog Sync) — pull CMS to POST-MVP, rename child
// ============================================================
console.log('\n-- Step 7: Phase 7 Catalog Sync — pull CMS to POST-MVP --');
let postMvpCmsId = await findRollupId('[POST-MVP] CMS Integration');
if (!postMvpCmsId) {
  postMvpCmsId = await insert({
    title: '[POST-MVP] CMS Integration',
    description: 'CMS platform decision + per-brand CMS integration. Code-driven pages are sufficient for MVP; CMS picked up after MVP UAT.',
    status: 'pending', priority: 'medium', sort_order: 1900,
  });
}
const cmsItems = ['[POST-MVP] CMS platform decision', '[POST-MVP] CMS integration'];
let cmsSort = 10;
for (const t of cmsItems) {
  const id = await findItemByTitle(t);
  if (!id) { console.log(`  SKIP (not found): ${t}`); continue; }
  await update(id, { parent_id: postMvpCmsId, sort_order: cmsSort });
  cmsSort += 10;
  console.log(`  ✓ moved to POST-MVP: ${t}`);
}
// Rename Phase 7's remaining child
const courseSyncId = await findItemByTitle('Course sync cron (TI → BC)');
if (courseSyncId) {
  await update(courseSyncId, { title: '7.9 Course sync cron (TI → BC)', sort_order: 10 });
  console.log(`  ✓ Course sync cron (TI → BC) → 7.9 Course sync cron`);
}
// Phase 7 was in_progress because of CMS; now it's complete
const phase7Id = await findRollupId('Phase 7: Catalog Sync (TI → BC)');
if (phase7Id) {
  await update(phase7Id, { status: 'complete' });
  console.log(`  ✓ Phase 7 status: in_progress → complete`);
}

// ============================================================
// Step 8: Phase 5 (Cart + Checkout) children rename: 4.X → 5.X
// ============================================================
console.log('\n-- Step 8: Phase 5 Cart + Checkout children rename --');
const phase5Renames = [
  ['4.4 Cart + checkout',                                                 '5.4 Cart + checkout', 40],
  ['4.4a Hook BC customer mapping into auth session',                     '5.4a Hook BC customer mapping into auth session', 41],
  ['4.4b Anonymous session management for cart persistence',              '5.4b Anonymous session management for cart persistence', 42],
  ['4.4c Payment loop validation — processPayment + refundOrder E2E via BC sandbox', '5.4c Payment loop validation — processPayment + refundOrder E2E via BC sandbox', 43],
  ['4.5 Post-purchase enrollment (Tier 2 sync)',                          '5.5 Post-purchase enrollment (Tier 2 sync)', 50],
  ['4.10a Self-serve subscription extensions',                            '5.10a Self-serve subscription extensions', 100],
  ['4.10b Fixed-date promotions',                                         '5.10b Fixed-date promotions', 101],
  ['4.10c Bundle handling — individual activation',                       '5.10c Bundle handling — individual activation', 102],
  ['4.10d Bulk promo code generation',                                    '5.10d Bulk promo code generation', 103],
  ['4.10e HubSpot subscription alerts integration',                       '5.10e HubSpot subscription alerts integration', 104],
];
for (const [oldT, newT, sort] of phase5Renames) {
  const id = await findItemByTitle(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT.slice(0,55)} → ${newT.slice(0,55)}`);
}

// 4.5b CE chain E2E moves to Phase 10 children
console.log('\n-- Step 8b: 4.5b CE chain E2E → Phase 10 --');
const ceE2EId = await findItemByTitle('4.5b CE purchase chain E2E script');
if (ceE2EId) {
  await update(ceE2EId, {
    parent_id: phase10Id,
    title: 'E2E: CE Purchase Chain — full BC → SF → TI → Supabase script',
    sort_order: 1200,
  });
  console.log(`  ✓ 4.5b CE chain E2E moved to Phase 10`);
}

// Mark 4.10c (now 5.10c) complete per the plan reconciliation discussion
const bundleId = await findItemByTitle('5.10c Bundle handling — individual activation');
if (bundleId) {
  await update(bundleId, { status: 'complete' });
  console.log(`  ✓ 5.10c bundle handling → complete (per plan reconciliation)`);
}

// ============================================================
// Step 9: Phase 8 (Cert Pipeline) children rename: 4.11X → 8.11X
// ============================================================
console.log('\n-- Step 9: Phase 8 Cert Pipeline children rename --');
const phase8Renames = [
  ['4.11a `packages/certificates/` package scaffold',     '8.11a `packages/certificates/` package scaffold', 10],
  ['4.11b Database migration for CE-compliance fields',   '8.11b Database migration for CE-compliance fields', 20],
  ['4.11c Supabase Storage bucket + RLS',                 '8.11c Supabase Storage bucket + RLS', 30],
  ['4.11e Webhook integration',                            '8.11e Webhook integration', 50],
  ['4.11f Public verification endpoint',                  '8.11f Public verification endpoint', 60],
];
for (const [oldT, newT, sort] of phase8Renames) {
  const id = await findItemByTitle(oldT);
  if (!id) { console.log(`  SKIP (not found): ${oldT}`); continue; }
  await update(id, { title: newT, sort_order: sort });
  console.log(`  ✓ ${oldT.slice(0,55)} → ${newT.slice(0,55)}`);
}

console.log('\n-- DONE --');

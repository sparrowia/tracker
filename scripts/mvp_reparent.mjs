// Re-parent the 9 MVP scope-reframe items under their correct phase rollups.
// The action_items.parent_id column wasn't in the initial migration so the
// first reframe pass left these as orphans. Run with --dry-run to preview.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PROJECT_ID = project.id;

// Map child title (exact) → parent title (exact)
const REPARENT = {
  '4.3b Catalog search audit':                              'Phase 4A: App Shell + Auth + Browsing',
  '4.5b CE purchase chain E2E script':                      'Phase 4B: Cart + Checkout + Enrollment',
  '5b.1 VetPrep brand configuration':                       'Phase 5b: Second Brand Launch — VetPrep',
  '5b.2 VetPrep Vercel deployment':                         'Phase 5b: Second Brand Launch — VetPrep',
  '5b.3 VetPrep design pull-over from existing repo':       'Phase 5b: Second Brand Launch — VetPrep',
  '5b.4 VetPrep QA':                                        'Phase 5b: Second Brand Launch — VetPrep',
  '5b.5 VetPrep launch':                                    'Phase 5b: Second Brand Launch — VetPrep',
  'E2E: Single-Account Cross-Brand Identity':               'End-to-End Testing: Pre-Launch',
  // 'Phase 5b: Second Brand Launch — VetPrep' stays top-level (no parent), like Phase 5.
};

const { data: items } = await sb.from('action_items')
  .select('id, title, parent_id, sort_order')
  .eq('project_id', PROJECT_ID);

const byTitle = new Map(items.map(i => [i.title, i]));

// For sort_order, place each new child after the highest existing sort_order under its parent.
const childrenByParent = new Map();
for (const it of items) {
  if (it.parent_id) {
    if (!childrenByParent.has(it.parent_id)) childrenByParent.set(it.parent_id, []);
    childrenByParent.get(it.parent_id).push(it);
  }
}

// Track the running max-sort per parent so multiple new children get distinct slots.
const runningMaxByParent = new Map();
for (const [pid, sibs] of childrenByParent.entries()) {
  runningMaxByParent.set(pid, sibs.reduce((m, s) => Math.max(m, s.sort_order || 0), 0));
}

const updates = [];
for (const [childTitle, parentTitle] of Object.entries(REPARENT)) {
  const child = byTitle.get(childTitle);
  const parent = byTitle.get(parentTitle);
  if (!child) { console.error(`MISSING child: ${childTitle}`); continue; }
  if (!parent) { console.error(`MISSING parent: ${parentTitle}`); continue; }
  const currentMax = runningMaxByParent.get(parent.id) || 0;
  const newSort = currentMax + 10;
  runningMaxByParent.set(parent.id, newSort);
  updates.push({
    id: child.id,
    title: child.title,
    parent_id: parent.id,
    parent_title: parent.title,
    sort_order: newSort,
    current_parent: child.parent_id,
  });
}

console.log(`Re-parenting ${updates.length} items:`);
for (const u of updates) {
  console.log(`  ${u.title}`);
  console.log(`    → parent: ${u.parent_title} (sort_order ${u.sort_order})`);
  console.log(`    current parent_id: ${u.current_parent || 'null'}`);
}

if (DRY) {
  console.log('\nDRY RUN — no writes');
  process.exit(0);
}

for (const u of updates) {
  const { error } = await sb.from('action_items')
    .update({ parent_id: u.parent_id, sort_order: u.sort_order })
    .eq('id', u.id);
  if (error) console.error(`update error on ${u.title}:`, error);
  else console.log(`updated: ${u.title}`);
}

console.log('\nDone.');

// MVP Scope Reframe — 2026-05-04
// Adds POST-MVP prefix to deferred items and creates new MVP-critical items.
// Run with: cd ~/projects/edcetera-pm && node scripts/mvp_scope_reframe.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');
const PREFIX = '[POST-MVP] ';

const { data: project, error: pErr } = await sb.from('projects').select('id, org_id').eq('slug', 'internal-development').single();
if (pErr) { console.error('project lookup error:', pErr); process.exit(1); }
const PROJECT_ID = project.id;
const ORG_ID = project.org_id;
console.log(`Project ${PROJECT_ID} (org ${ORG_ID})`);
console.log(DRY ? 'DRY RUN — no writes' : 'LIVE — writes will happen');

// Title fragments to identify items to prefix.
// Match by `LIKE %fragment%` to avoid being too brittle on exact titles.
const POST_MVP_TITLE_FRAGMENTS = [
  '4.8 CMS',
  'CMS platform decision',
  'CMS integration',
  '5.6 Brand porting',
  '6.1 Dashboard package',
  '6.2 Embed in storefront',
  'Phase 6: Cross-Brand Dashboard',
  '7.2 Customer 360',
  '7.4 Brand configuration view',
  '7.5 Reporting',
  '7.6 Operational tools',
  '7.7 Support ticket visibility',
  '8.1 BenchPrep → Snowflake',
  '8.2 TI → BI Connector',
  '8.3 Salesforce data sync',
  '8.4 Reconciliation monitoring',
  'Phase 8: Sync Layer',
  'Code Review Gate 2',
];

// Items to ADD (5b cluster, 4.3b, 4.5b, single-account E2E).
const NEW_ITEMS = [
  {
    title: '4.3b Catalog search audit',
    description: 'Verify storefront catalog search exists or implement BC-backed search. MVP requirement — DC Hours and VetPrep both need CE-style course search.',
    priority: 'high',
    due_date: '2026-05-08',
  },
  {
    title: '4.5b CE purchase chain E2E script',
    description: 'Build apps/storefront/scripts/test-e2e-ce-purchase.ts mirroring the Prep script. Validates full CE purchase chain (BC → SF → TI → Supabase → refund + access revocation). Requires seeding edcet- prefixed test content in TI Edcetera Dev panorama.',
    priority: 'critical',
    due_date: '2026-05-15',
  },
  {
    title: '5b.1 VetPrep brand configuration',
    description: 'Add vetprep entry to brand-config, pull theme from ~/Repositories/edcetera_vetprep, set up BC channel + OneLogin + BP + SF queue + GTM env vars, configure feature flags (prep_enabled=on, ce_enabled=off).',
    priority: 'critical',
    due_date: '2026-06-30',
  },
  {
    title: '5b.2 VetPrep Vercel deployment',
    description: 'Create Vercel production project for VetPrep, set env vars, deploy from production branch, configure custom domain or staging-prefix domain.',
    priority: 'critical',
    due_date: '2026-07-05',
  },
  {
    title: '5b.3 VetPrep design pull-over from existing repo',
    description: 'Audit ~/Repositories/edcetera_vetprep for components/layouts/theme tokens. Port reusable UI into unified storefront per-brand override layer. Code-driven copy for MVP (CMS deferred).',
    priority: 'high',
    due_date: '2026-07-08',
  },
  {
    title: '5b.4 VetPrep QA',
    description: 'End-to-end Prep purchase flow on VetPrep, account pages, single-account cross-brand auth (same OneLogin login works on both VetPrep + DC Hours), feature flags, mobile, certificate generation on completion.',
    priority: 'critical',
    due_date: '2026-07-12',
  },
  {
    title: '5b.5 VetPrep launch',
    description: 'Promote VetPrep staging to production, DNS cutover, verify production deployment, monitor first 24-48h. Second MVP brand live.',
    priority: 'critical',
    due_date: '2026-07-15',
  },
  {
    title: 'Phase 5b: Second Brand Launch — VetPrep',
    description: 'MVP gate. VetPrep launches on the unified platform as the Prep-side counterpart to DC Hours. Pulls existing VetPrep design, connects to unified backend. MVP completion = two brands live + single account works on both.',
    priority: 'critical',
    due_date: '2026-07-15',
  },
  {
    title: 'E2E: Single-Account Cross-Brand Identity',
    description: 'Same OneLogin email signs into both DC Hours and VetPrep; BC customer is the same record; per-brand account views show that brand\'s purchases; logout on one brand does not silently keep a session on the other. Validates the MVP single-account requirement.',
    priority: 'critical',
    due_date: '2026-06-19',
  },
];

// === Step 1: Identify items to prefix ===
const { data: allItems, error: aErr } = await sb.from('action_items').select('id, title, status, priority').eq('project_id', PROJECT_ID);
if (aErr) { console.error('fetch items error:', aErr); process.exit(1); }

const toPrefix = [];
for (const item of allItems) {
  if (item.title.startsWith(PREFIX)) continue; // already prefixed
  for (const frag of POST_MVP_TITLE_FRAGMENTS) {
    if (item.title.includes(frag)) {
      toPrefix.push(item);
      break;
    }
  }
}
console.log(`\nWill prefix [POST-MVP] on ${toPrefix.length} items:`);
for (const it of toPrefix) console.log(`  [${it.status}] ${it.title}`);

// === Step 2: Identify new items to insert (skip if title already exists) ===
const existingTitles = new Set(allItems.map(i => i.title));
const toInsert = NEW_ITEMS.filter(n => !existingTitles.has(n.title));
console.log(`\nWill insert ${toInsert.length} new items:`);
for (const n of toInsert) console.log(`  [${n.priority}] ${n.due_date} ${n.title}`);

// === Step 3: Apply (unless dry run) ===
if (DRY) {
  console.log('\nDRY RUN done — no changes applied.');
  process.exit(0);
}

let prefixed = 0;
for (const item of toPrefix) {
  const { error } = await sb.from('action_items').update({ title: PREFIX + item.title }).eq('id', item.id);
  if (error) { console.error(`prefix error on ${item.id}:`, error); }
  else { prefixed++; }
}
console.log(`\nPrefixed: ${prefixed}/${toPrefix.length}`);

let inserted = 0;
for (const n of toInsert) {
  const { error } = await sb.from('action_items').insert({
    org_id: ORG_ID,
    project_id: PROJECT_ID,
    title: n.title,
    description: n.description,
    priority: n.priority,
    due_date: n.due_date,
    status: 'pending',
  });
  if (error) { console.error(`insert error on "${n.title}":`, error); }
  else { inserted++; }
}
console.log(`Inserted: ${inserted}/${toInsert.length}`);

console.log('\nDone.');

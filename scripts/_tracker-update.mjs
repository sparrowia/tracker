import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');
const log = (...a) => console.log(...a);

const { data: project } = await sb.from('projects').select('id, org_id').eq('slug','internal-development').single();
log(`Project: ${project.id} (org ${project.org_id})`);

async function findOne(title) {
  const { data, error } = await sb.from('action_items')
    .select('id, title, status, parent_id, sort_order')
    .eq('project_id', project.id).eq('title', title).single();
  if (error) { console.error(`Could not find "${title}":`, error.message); return null; }
  return data;
}

// Step 1: Flip three items to in_progress
const flips = [
  '3.10 Salesforce transaction recording implementation',
  '5.5 Post-purchase enrollment (Tier 2 sync)',
  '5.4c Payment loop validation — processPayment + refundOrder E2E via BC sandbox',
];
for (const title of flips) {
  const it = await findOne(title);
  if (!it) continue;
  log(`\n[FLIP] "${it.title}" ${it.status} → in_progress`);
  if (!DRY) {
    const { error } = await sb.from('action_items').update({ status: 'in_progress' }).eq('id', it.id);
    if (error) console.error('  update error:', error); else log('  OK');
  }
}

// Step 2: Add 3 new items
// 3.15 Avalara — under Phase 3 parent, after 3.14
const phase3 = await findOne('Phase 3: Integration Packages');
const phase5 = await findOne('Phase 5: Cart + Checkout + Enrollment');
const phase11 = await findOne('Phase 11: First Brand Launch — DC Hours');
log(`\nPhase 3 id: ${phase3?.id}`);
log(`Phase 5 id: ${phase5?.id}`);
log(`Phase 11 id: ${phase11?.id}`);

// Pull sibling sort orders to slot new items at the end of each phase
async function nextSortOrder(parentId) {
  const { data } = await sb.from('action_items')
    .select('sort_order')
    .eq('parent_id', parentId)
    .order('sort_order', { ascending: false })
    .limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

const so315 = await nextSortOrder(phase3.id);
const so44d = await nextSortOrder(phase5.id);
const so117 = await nextSortOrder(phase11.id);
log(`\nsort_orders to insert: 3.15=${so315}, 4.4d=${so44d}, 11.7=${so117}`);

const newItems = [
  {
    title: '3.15 Avalara integration (packages/integrations/avalara/)',
    description: 'Direct Avalara from backend (Option 1 architecture). calculateTax (uncommitted preview), commitTransaction (post-purchase with companyCode), voidTransaction (refund). Two-legal-entity routing via brand-config legalEntity → AVALARA_COMPANY_CODE_<ENTITY>. Sandbox smoke. [MVP-critical] Blocks DC Hours real-money launch. Added 2026-05-20. See implementation-plan.md §3.15.',
    parent_id: phase3.id,
    sort_order: so315,
  },
  {
    title: '4.4d Tax-aware checkout flow',
    description: 'Wire Avalara into checkout: calculateTax at quote/init, surface tax line in UI, Stripe PaymentIntent amount = subtotal+tax, BC order updated with tax, BCLineItemInput.totalTax populated, commitTransaction post-purchase, voidTransaction on refund. No silent-zero-tax path. [MVP-critical] Added 2026-05-20. See implementation-plan.md §4.4d.',
    parent_id: phase5.id,
    sort_order: so44d,
  },
  {
    title: '11.7 DC Hours tax + SF end-to-end validation',
    description: 'Tomorrow target (2026-05-21). Verify: SF env vars set; Avalara env vars set; real test purchase shows tax in UI; Stripe captures subtotal+tax; BC order records tax; Avalara DocumentCode recorded; SF Account+Opp+CC with correct Tax_Total__c + payment_intent_id; refund voids Avalara + updates SF. [MVP-critical] Added 2026-05-20.',
    parent_id: phase11.id,
    sort_order: so117,
  },
];

log('\n=== Inserts ===');
for (const ni of newItems) {
  log(`  + ${ni.title} (parent=${ni.parent_id}, sort_order=${ni.sort_order})`);
  if (!DRY) {
    const { error, data } = await sb.from('action_items').insert({
      ...ni,
      project_id: project.id,
      org_id: project.org_id,
      status: 'pending',
    }).select('id').single();
    if (error) console.error('  insert error:', error); else log(`  OK id=${data.id}`);
  }
}

log(`\nDone (DRY=${DRY}).`);

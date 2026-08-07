// Create "WORKING UX" project under the Unified System initiative
// with 5 waves of tasks reflecting the customer-flow visual port plan.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const INITIATIVE_ID = '90a92403-fce6-40e2-8fce-2946cf4886d3';
const ORG_ID = 'caaa4383-47d2-4e08-8369-b55865b5e1a5';
const SLUG = 'working-ux';

// 1. Create or fetch the project
let projectId;
const { data: existing } = await sb.from('projects').select('id').eq('slug', SLUG).maybeSingle();
if (existing) {
  projectId = existing.id;
  console.log(`Project already exists: ${projectId}`);
} else {
  const { data: created, error } = await sb.from('projects').insert({
    org_id: ORG_ID,
    initiative_id: INITIATIVE_ID,
    name: 'WORKING UX',
    slug: SLUG,
    description: 'Customer-flow visual port. Make the unified storefront represent the full customer journey (browse → purchase → dashboard → launch → cert download) for internal stakeholder demos. Architecture preserved (multi-brand, BC REST, OneLogin, packages/ui). Reference: ~/Repositories/edcetera_architect for visual cues; do not pull Catalyst client / Vibes / next-intl / MakeSwift. See docs/working.md or the impl-plan for the in-flight detail.',
    health: 'on_track',
    start_date: '2026-05-05',
    target_completion: '2026-05-12',
  }).select('id').single();
  if (error) throw error;
  projectId = created.id;
  console.log(`Project created: ${projectId}`);
}

// 2. Define waves (top-level rollups) + children
const TODAY = '2026-05-05';
const waves = [
  {
    title: 'Wave 1 — Foundation (theme tokens + chrome + UI primitives)',
    description: 'Without this, every page looks ad-hoc. With it, every subsequent wave comes together fast.',
    priority: 'critical',
    due_date: '2026-05-06',
    sort_order: 100,
    children: [
      { title: 'Brand-config theme tokens (font stacks, surface/text colors)', priority: 'critical', due_date: '2026-05-06', sort_order: 10,
        description: 'Add fontFamilyHeading, fontFamilySans, surfaceColor, textColor to BrandTheme. Engineering brand defaults from Architect. Test brand sensible defaults. DC Hours / VetPrep TBD per brand design.' },
      { title: 'Root layout + brand CSS variables hooked', priority: 'critical', due_date: '2026-05-06', sort_order: 20,
        description: 'apps/storefront/src/app/layout.tsx — proper page chrome wrapper, brand vars on body, font stack applied.' },
      { title: 'packages/ui — fill skeleton with 8 primitives', priority: 'critical', due_date: '2026-05-06', sort_order: 30,
        description: 'Button (primary/secondary/outline/ghost), Card, Badge, Chip, Dropdown (promote from catalog), Alert, Spinner, IconButton. All Tailwind, no Vibes runtime.' },
      { title: 'Header refresh — logo + nav + cart icon + account menu', priority: 'high', due_date: '2026-05-06', sort_order: 40,
        description: 'Sticky on scroll. Brand-themed via CSS vars. Account menu reads session.' },
      { title: 'Footer refresh — multi-column with Support / Legal / Contact', priority: 'high', due_date: '2026-05-06', sort_order: 50,
        description: 'Includes payment-method icons. Brand-themed.' },
    ],
  },
  {
    title: 'Wave 2 — Customer Dashboard (priority for internal stakeholders)',
    description: 'The centerpiece. This is what internal team members will judge the platform on.',
    priority: 'critical',
    due_date: '2026-05-08',
    sort_order: 200,
    children: [
      { title: 'Account layout shell with sidebar nav', priority: 'critical', due_date: '2026-05-07', sort_order: 10,
        description: 'Sidebar links: Dashboard / My Courses / Certificates / Orders / Preferences. Active-state highlighting. Wraps all /account/* pages.' },
      { title: '/account overview — visual dashboard', priority: 'critical', due_date: '2026-05-07', sort_order: 20,
        description: 'Greeting, stats row (in progress / completed / certs), recent courses with Launch buttons, recent certs with Download buttons, upcoming expirations, quick links.' },
      { title: '/account/courses — Launch button + status filtering', priority: 'critical', due_date: '2026-05-08', sort_order: 30,
        description: 'Course cards: thumbnail, title, status badge (Active/Completed/Expiring), credit hours, duration. Launch button calls TI JWT SSO server action (CE) or BP redirect (Prep). Continue button for in-progress. Existing Extend button preserved (4.10a). Filter pills: All / In Progress / Completed / Expiring.' },
      { title: '/account/certificates — working Download + Verify links', priority: 'critical', due_date: '2026-05-08', sort_order: 40,
        description: 'Card list with cert thumbnail, course name, completion date, credit hours, accreditor. Working Download button → /api/certificates/[id]/download. Verify link → /verify/[code] in new tab.' },
      { title: '/account/orders polish + /account/orders/[id] detail', priority: 'high', due_date: '2026-05-08', sort_order: 50,
        description: 'Order cards: date, total, item count, status. Click into detail page with line items. Re-buy affordance (deferred logic but plumb the link).' },
      { title: '/account/preferences (NEW) — name, phone, comm prefs', priority: 'high', due_date: '2026-05-08', sort_order: 60,
        description: 'Form: name, email (read-only from OneLogin), phone, marketing-email toggle, communication preferences. New user_preferences table (small migration) keyed on email + brand_id. Server action for save.' },
    ],
  },
  {
    title: 'Wave 3 — Purchase flow polish',
    description: 'Make the buy path look like a real product, not a placeholder.',
    priority: 'high',
    due_date: '2026-05-09',
    sort_order: 300,
    children: [
      { title: '/courses/[id] product detail visual refresh', priority: 'high', due_date: '2026-05-09', sort_order: 10,
        description: 'Hero with course image, title, author, credit hours, duration. Description, what-you-will-learn, price, Buy Now button. Related courses rail.' },
      { title: '/cart polish — line items + totals card + CTA', priority: 'high', due_date: '2026-05-09', sort_order: 20,
        description: 'Visual refresh of cart page. Continue-to-checkout CTA.' },
      { title: '/checkout polish — stepped sections + order summary', priority: 'high', due_date: '2026-05-09', sort_order: 30,
        description: 'Keep existing card inputs (4.4c). Refine layout into Customer / Billing / Payment sections. Order summary card on right.' },
    ],
  },
  {
    title: 'Wave 4 — Customer-flow gap closers',
    description: 'The actual missing wires from the customer-journey audit. Feature, not visual.',
    priority: 'critical',
    due_date: '2026-05-10',
    sort_order: 400,
    children: [
      { title: '/api/certificates/[id]/download route handler', priority: 'critical', due_date: '2026-05-10', sort_order: 10,
        description: 'Auth check (session email matches cert email), call getSignedDownloadUrl from @edcetera/certificates, redirect to signed URL. Closes the broken cert download today.' },
      { title: 'TI Launch server action (JWT SSO redirect)', priority: 'critical', due_date: '2026-05-10', sort_order: 20,
        description: 'apps/storefront/src/app/account/courses/_actions/launch.ts — builds JWT SSO URL via getTISSOUrl(), redirects. Wires the Launch button in Wave 2.' },
      { title: 'TEST_MODE payment bypass (env-flagged, demo only)', priority: 'high', due_date: '2026-05-10', sort_order: 30,
        description: 'place-order/route.ts: if TEST_MODE_PAYMENTS=1 skip real processPayment and write a stub payment_id. Demos work without spending money on BC paid plan. NEVER for prod.' },
    ],
  },
  {
    title: 'Wave 5 — Optional finishers',
    description: 'Only if Waves 1-4 finish with time to spare. Demo can start at /courses without these.',
    priority: 'medium',
    due_date: '2026-05-11',
    sort_order: 500,
    children: [
      { title: 'Homepage hero + featured courses rail', priority: 'medium', due_date: '2026-05-11', sort_order: 10,
        description: 'Hero with brand messaging + Browse Courses CTA + featured-courses carousel.' },
    ],
  },
];

console.log('\nInserting waves + children...');
for (const wave of waves) {
  // Check if wave rollup already exists
  const { data: existingWave } = await sb.from('action_items')
    .select('id').eq('project_id', projectId).eq('title', wave.title).maybeSingle();
  let waveId;
  if (existingWave) {
    waveId = existingWave.id;
    console.log(`  rollup exists: ${wave.title}`);
  } else {
    const { data, error } = await sb.from('action_items').insert({
      org_id: ORG_ID,
      project_id: projectId,
      title: wave.title,
      description: wave.description,
      priority: wave.priority,
      status: 'pending',
      due_date: wave.due_date,
      sort_order: wave.sort_order,
      first_flagged_at: TODAY,
    }).select('id').single();
    if (error) throw error;
    waveId = data.id;
    console.log(`  rollup created: ${wave.title}`);
  }

  for (const child of wave.children) {
    const { data: existingChild } = await sb.from('action_items')
      .select('id').eq('project_id', projectId).eq('parent_id', waveId).eq('title', child.title).maybeSingle();
    if (existingChild) {
      console.log(`    child exists: ${child.title}`);
      continue;
    }
    const { error } = await sb.from('action_items').insert({
      org_id: ORG_ID,
      project_id: projectId,
      parent_id: waveId,
      title: child.title,
      description: child.description,
      priority: child.priority,
      status: 'pending',
      due_date: child.due_date,
      sort_order: child.sort_order,
      first_flagged_at: TODAY,
    });
    if (error) throw error;
    console.log(`    child inserted: ${child.title}`);
  }
}

console.log('\nDone. Project URL: https://edcet-tracker.vercel.app/projects/' + SLUG);

// Insert 24 storefront security/architecture audit findings as raid_entries
// (type='issue') in the internal-development project. Idempotent on title:
// if a finding with the same title already exists, it's skipped.
//
// Display IDs assigned starting at the current max+1 (I197 at time of writing).
//
// Run with: node scripts/_insert-audit-findings.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

const ORG_ID = 'caaa4383-47d2-4e08-8369-b55865b5e1a5';
const PROJECT_ID = 'e246c499-7f04-4b48-a2a2-e7cafc1aa371'; // internal-development

const findings = [
  // ---------- CRITICAL ----------
  {
    code: 'C1',
    priority: 'critical',
    title: 'getServerSession() called without authOptions — custom session fields silently undefined',
    impact: 'Cascades into M2/M3/H4: receipt + cert download access checks silently bypass because bcCustomerId / brandId are never populated on the helper-returned session.',
    description: `**File:** apps/storefront/src/lib/session.ts:17

\`await getServerSession()\` (no args) reads the cookie + verifies the JWT but does NOT run the custom \`session\` callback from \`apps/storefront/src/app/api/auth/[...nextauth]/route.ts\`. So \`session.bcCustomerId\`, \`session.bcCustomerGroupId\`, and \`session.brandId\` are always \`undefined\` from this helper, regardless of what's on the JWT.

Every downstream check that uses these fields silently bypasses.`,
    next_steps: 'Export authOptions from the route module; pass them: getServerSession(authOptions). Add a test asserting session.bcCustomerId is defined for a signed-in user.',
  },
  {
    code: 'C2',
    priority: 'critical',
    title: 'Raw cardholder data handled server-side → PCI scope (SAQ D)',
    impact: 'External audit will flag. PCI-DSS scope creep brings annual costs (assessment, scanning, training) and broader liability.',
    description: `**Files:** apps/storefront/src/app/api/checkout/place-order/route.ts:30-36, 222-233

Route accepts cardNumber/cvv in JSON body and forwards to BC Payments. Per PCI-DSS any system that transmits cardholder data is in scope. The architecture intentionally mirrors the live Architect pattern, but external auditors will absolutely flag this.`,
    next_steps: 'Migrate to Stripe Elements / BC Hosted Checkout — tokenize on client so the PAN never touches our origin. Reduces scope from SAQ D to SAQ A. Treat as architecture decision pending re-evaluation; revisit with arch plan Part 5.',
  },

  // ---------- HIGH ----------
  {
    code: 'H1',
    priority: 'high',
    title: 'TEST_MODE_PAYMENTS backdoor has no production guard',
    impact: 'If env var ever lands in a prod Vercel config (template copy/paste, operator error), customers can place free orders that complete the full enrollment + SF + HubSpot chain.',
    description: `**File:** apps/storefront/src/app/api/checkout/place-order/route.ts:186-203

If \`TEST_MODE_PAYMENTS=1\` is set, the route bypasses BC Payments entirely, status-flips orders to "paid", and runs the full post-purchase chain — without taking a card. Comment says "Never enable in production" but nothing enforces it.`,
    next_steps: 'Hard-fail when NODE_ENV === "production" OR refuse unless a second gate env var (e.g. ALLOW_TEST_MODE_PAYMENTS_IN_NON_PROD=1) is also set.',
  },
  {
    code: 'H2',
    priority: 'high',
    title: 'No rate limit on /api/checkout/place-order → carding oracle',
    impact: 'Free service for stolen-card validation. Attackers blacklist our payment gateway; PCI compliance flags carding patterns; potential merchant account suspension.',
    description: `**File:** apps/storefront/src/app/api/checkout/place-order/route.ts

Endpoint returns clearly-mapped 402 with "card was declined" vs 200 success. With no IP/cart/email rate limit, attackers validate stolen card numbers at scale (well-known carding attack pattern; AWS/Stripe publish guidance).`,
    next_steps: 'Edge-level rate limit (Vercel Firewall or Upstash Redis). 5 attempts per IP per hour, progressive friction (require email confirm / captcha after threshold).',
  },
  {
    code: 'H3',
    priority: 'high',
    title: '/api/cart/remove has no cart-ownership check',
    impact: 'Authenticated or anonymous attackers can delete items from any cart on the BC store knowing only the cart + item IDs.',
    description: `**File:** apps/storefront/src/app/api/cart/remove/route.ts:5-24

Accepts cartId + itemId from body, calls DELETE /carts/{cartId}/items/{itemId} against BC. No verification that the caller owns the cart. Cart IDs are UUIDs (obscure but enumerable in URLs/logs/responses).`,
    next_steps: 'Read cartId from edcet-bc-cart-id cookie, not body. If both present, body must match cookie.',
  },
  {
    code: 'H4',
    priority: 'high',
    title: 'bcCustomerId trusted from request body in place-order',
    impact: 'Logged-in attacker can spoof order attribution → wrong customer in SF/HubSpot/BP/TI. Corrupts revenue reporting and enables fraud against benefits tied to customer records.',
    description: `**File:** apps/storefront/src/app/api/checkout/place-order/route.ts:28, 292

bcCustomerId taken from body, passed straight to runPostPurchaseEnrollment which writes it as customer-of-record. Should come from session.`,
    next_steps: 'Derive bcCustomerId from session JWT (requires fixing C1 first). Never read from body.',
  },
  {
    code: 'H5',
    priority: 'high',
    title: 'launchTICourse server action — no entitlement check',
    impact: 'Any logged-in user can SSO into any TI course slug without purchasing. Severity depends on whether TI panorama enforces course-level entitlement at deep-link time (needs verification).',
    description: `**File:** apps/storefront/src/app/account/courses/_actions/launch.ts:12-35

Action accepts any courseSlug from the client, signs a JWT with courseSlugs set to whatever was requested, and redirects to TI's /access/jwt. No server-side check that the user has access to that course in the local enrollments table.`,
    next_steps: 'Before signing JWT, query enrollments table for (email = session.email, course_id/slug = courseSlug, brand_id = current, status IN ("active", "completed")). Deny if no row. Also verify TI panorama deep-link entitlement behavior.',
  },
  {
    code: 'H6',
    priority: 'high',
    title: '/api/support/submit — no auth, no rate limit, no spam protection, no attachment cap',
    impact: 'Open spam pipeline into Salesforce. DoS SF queue capacity, attachment storage exhaustion, phishing pivot (cases submitted as arbitrary emails).',
    description: `**File:** apps/storefront/src/app/api/support/submit/route.ts

Anyone can POST and create a Salesforce Case with arbitrary name/email/details + attachments. No size cap, no count cap, no rate limit, no captcha.`,
    next_steps: 'Rate limit per IP. Server-side cap: ≤3 attachments, ≤25MB each, ≤50MB total. Captcha or proof-of-work for unauthenticated submits. Consider requiring session for non-trivial submissions.',
  },
  {
    code: 'H7',
    priority: 'high',
    title: 'Cron endpoints open when CRON_SECRET unset; comparison non-timing-safe',
    impact: 'In production with missing env var, anyone can trigger SF API calls / TI→BC product writes. Cost + reliability + abuse vector.',
    description: `**Files:** apps/storefront/src/app/api/cron/sf-retry-drain/route.ts:18-24, apps/storefront/src/app/api/cron/sync-courses/route.ts:27-33

\`if (cronSecret) { check }\` — if env var missing, route is wide open. Plus \`!==\` leaks timing.`,
    next_steps: 'Refuse with 500 when CRON_SECRET missing in production. Use crypto.timingSafeEqual. Optionally gate on x-vercel-cron header presence too.',
  },
  {
    code: 'H8',
    priority: 'high',
    title: 'BC order-refund webhook hardcodes brandId from env',
    impact: 'Misdelivered webhooks (BC store-wide) silently no-op when brand env mismatches the order; refund accounting drift.',
    description: `**File:** apps/storefront/src/app/api/webhooks/bigcommerce/order-refund/route.ts:48

\`const brandId = process.env.NEXT_PUBLIC_BRAND_ID || ''\` — if env missing, .eq("brand_id", "") matches nothing and refund silently succeeds with no-op. BC store webhooks fire for all channels; wrong-deployment delivery loses the event.`,
    next_steps: 'Refuse on empty brand. Resolve brand from order.channel_id via brand-config reverse-lookup. Failed delivery returns 5xx so BC retries.',
  },
  {
    code: 'H9',
    priority: 'high',
    title: 'Service-role client used pervasively in storefront → RLS bypassed at app layer',
    impact: 'Architecture-plan promise of "RLS filters by brandId" is enforced only by manual app code. One missed .eq("brand_id", …) = cross-brand data leak. Audit-worthy gap between architecture intent and implementation.',
    description: `**File:** packages/db/src/client.ts:18-22 + 20+ call sites across storefront

Every storefront read/write uses service role key, bypassing RLS entirely. Combined with C1 (session.brandId undefined), it's easy to silently drop the filter on a future query.`,
    next_steps: 'Two options — (a) build getScopedClient(session) helper that pre-binds brand_id+email and refuses unscoped queries; (b) switch to anon-key reads with RLS policies driven by JWT email + brandId claims (requires NextAuth JWT → Supabase JWT bridge). Document the chosen approach in architecture-plan Part 3.',
  },

  // ---------- MEDIUM ----------
  {
    code: 'M1',
    priority: 'medium',
    title: 'Demo verification fixture leaks into production /verify endpoint',
    impact: 'Third-party verifiers (employers, compliance auditors) hitting the demo code see "Verified" — credentials forgery surface; trust risk.',
    description: `**Files:** apps/storefront/src/app/verify/[code]/page.tsx:42-45, apps/storefront/src/lib/demo-fixtures.ts

Hardcoded DEMO-FL-PE-ETHICS-2026 short-circuit returns a successful "Verified" cert page in production.`,
    next_steps: 'Gate behind NEXT_PUBLIC_DEMO_MODE=1; only set on staging.',
  },
  {
    code: 'M2',
    priority: 'medium',
    title: 'Cert download — no brand-id check',
    impact: 'Cross-brand cert visibility for any logged-in user who knows a cert ID + matching email. May be intentional but inconsistent with per-brand-by-email account pages.',
    description: `**File:** apps/storefront/src/app/api/certificates/[id]/download/route.ts:30-42

Verifies cert.email matches session.email; doesn't check cert.brand_id == current request brand.`,
    next_steps: 'Add brand_id check, or formally document the cross-brand exception and apply consistently across cert/order/enrollment surfaces.',
  },
  {
    code: 'M3',
    priority: 'medium',
    title: 'Order receipt — bcCustomerId check skipped when undefined',
    impact: 'Any logged-in user can fetch arbitrary order receipts by guessing orderId. Compounds C1.',
    description: `**File:** apps/storefront/src/app/api/orders/[id]/receipt/route.ts:35

\`if (session.bcCustomerId && order.customer_id !== session.bcCustomerId)\` only fires when bcCustomerId is set. Combined with C1, never runs.`,
    next_steps: 'Fix C1. Then invert the guard: \`if (!session.bcCustomerId || order.customer_id !== session.bcCustomerId) return 403\`.',
  },
  {
    code: 'M4',
    priority: 'medium',
    title: 'TI webhook routes infer brandId from response-only header → always fallback to env',
    impact: 'Cross-brand TI deliveries can hit wrong deployment; brand context is unreliable. Same URL secret across all TI configs makes it impossible to identify origin.',
    description: `**File:** apps/storefront/src/app/api/webhooks/ti/completion/[token]/route.ts:27

\`request.headers.get('x-brand-id')\` — proxy sets this on outbound NextResponse, not inbound request. Always falls back to NEXT_PUBLIC_BRAND_ID.`,
    next_steps: 'Per-brand URL secrets (different token per brand TI config), or derive brand from panorama/course-id in payload.',
  },
  {
    code: 'M5',
    priority: 'medium',
    title: 'No CSRF tokens on state-changing API routes',
    impact: 'Audit-flagged. Modern browsers mitigate via SameSite, but cross-site form POSTs and same-origin XSS bypass that mitigation. Industry-standard defense missing.',
    description: `**Files:** apps/storefront/src/app/api/cart/*, support/submit, checkout/place-order

State-changing POSTs rely on SameSite=lax only. No Origin-header validation or CSRF token.`,
    next_steps: 'Validate Origin header against allowed brand domains on every state-changing route, OR adopt NextAuth CSRF token pattern for custom routes.',
  },
  {
    code: 'M6',
    priority: 'medium',
    title: '404 vs 403 leak existence on cert download',
    impact: 'Information disclosure — attacker probes to enumerate valid cert IDs.',
    description: `**File:** apps/storefront/src/app/api/certificates/[id]/download/route.ts:35-42

Returns 404 for nonexistent cert id, 403 for "exists but not yours".`,
    next_steps: 'Return identical 404 in both cases.',
  },
  {
    code: 'M7',
    priority: 'medium',
    title: 'Cart add — no quantity cap, no per-channel product validation',
    impact: 'BC API misuse / weird states / inventory artifacts. Low actual blast radius but auditors flag missing input validation.',
    description: `**File:** apps/storefront/src/app/api/cart/add/route.ts:23, 53-57

Accepts any positive quantity. Doesn't validate productId is on the brand channel.`,
    next_steps: 'Cap quantity (brand-config sourced max, default 10). Verify product channel-assignment before add via BC catalog channel-assignments lookup.',
  },
  {
    code: 'M8',
    priority: 'medium',
    title: 'TI completion webhook trusts payload.user.email entirely',
    impact: 'Compromise of the URL secret = fake completions for any user. Mitigation (IP allowlist) is documented-as-pending.',
    description: `**File:** apps/storefront/src/app/api/webhooks/ti/completion/[token]/route.ts:34, 58

Shared URL secret + payload-asserted email. IP allowlist mitigation pending TI support per docs/infrastructure.md.`,
    next_steps: 'Log all completion events for forensic review. Push TI support for outbound IP range; populate THOUGHT_INDUSTRIES_ALLOWED_IPS. Documented as pending per infrastructure.md and impl-plan 3.14 / 5.1.',
  },
  {
    code: 'M9',
    priority: 'medium',
    title: 'BP progress webhook resets start_date on every event',
    impact: 'Data integrity — start_date keeps moving forward as progress events arrive. Reporting accuracy gap.',
    description: `**File:** apps/storefront/src/app/api/webhooks/benchprep/progress/route.ts:31

\`start_date: new Date().toISOString()\` set on every progress update, not just the first.`,
    next_steps: 'Only set start_date on first event: add .is("start_date", null) clause OR coalesce(existing, now()) in the update.',
  },

  // ---------- LOW ----------
  {
    code: 'L1',
    priority: 'low',
    title: 'Sync-courses cron has unbounded TI→BC loop',
    impact: 'Reliability — will exceed Vercel function timeout (10s/60s) if TI returns many updated courses, e.g. on initial sync or bulk content update.',
    description: `**File:** apps/storefront/src/app/api/cron/sync-courses/route.ts:62-128

For-each loop makes 4+ BC API calls per course. With 100+ courses, timeout risk.`,
    next_steps: 'Cap loop size, paginate, OR batch with concurrency control (Promise.all with semaphore).',
  },
  {
    code: 'L2',
    priority: 'low',
    title: 'Logout cookie deletion misses cookie-prefix variants',
    impact: 'Defense-in-depth gap. If Next.js emits __Host- prefixed cookies under any config, they remain after proxy-triggered cookie clear.',
    description: `**File:** apps/storefront/src/proxy.ts:129-130

Deletes next-auth.session-token and __Secure-next-auth.session-token; doesn't handle __Host- variants.`,
    next_steps: 'Enumerate all NextAuth cookie variants and delete all of them on brand-mismatch redirect.',
  },
  {
    code: 'L3',
    priority: 'low',
    title: 'Preferences server action — no length cap on inputs',
    impact: 'Minor — DB column types provide implicit cap, but explicit validation produces better errors and prevents accidental garbage in the column.',
    description: `**File:** apps/storefront/src/app/account/preferences/_actions/save.ts:17-32

No length validation on firstName/lastName/phone.`,
    next_steps: 'Add length caps: firstName/lastName ≤100, phone ≤30 chars. Reject with 400 if exceeded.',
  },
  {
    code: 'L4',
    priority: 'low',
    title: 'NextAuth debug: true outside production',
    impact: 'JWT contents may be logged in staging. Fine in dev but verify never enabled in production env.',
    description: `**File:** packages/auth/src/config.ts:43

\`debug: process.env.NODE_ENV !== "production"\`. Vercel staging runs in production NODE_ENV so this is currently safe in staging, but the rule is implicit. Worth documenting / asserting.`,
    next_steps: 'Add an env-driven explicit flag (DEBUG_NEXTAUTH=1) instead of relying on NODE_ENV negation. Document in infrastructure.md.',
  },
];

console.log(`Preparing ${findings.length} findings.${DRY ? ' [DRY RUN]' : ''}`);

// Find max display_id with prefix I
const { data: existing } = await sb.from('raid_entries').select('display_id, title').like('display_id', 'I%').limit(2000);
const maxNum = Math.max(...(existing ?? []).map(r => parseInt((r.display_id || '').slice(1), 10)).filter(Number.isFinite));
let nextNum = maxNum + 1;
console.log(`Next display_id: I${nextNum}`);

// Idempotency map by exact title
const titles = new Set((existing ?? []).map(r => r.title));

const toInsert = [];
const skipped = [];
for (const f of findings) {
  if (titles.has(f.title)) {
    skipped.push(f);
    continue;
  }
  toInsert.push({
    org_id: ORG_ID,
    project_id: PROJECT_ID,
    raid_type: 'issue',
    display_id: `I${nextNum++}`,
    title: f.title,
    description: `**${f.code}**\n\n${f.description}`,
    impact: f.impact,
    next_steps: f.next_steps,
    priority: f.priority,
    status: 'pending',
    sort_order: 0,
  });
}

console.log(`To insert: ${toInsert.length}, skipped (existing): ${skipped.length}`);
for (const r of toInsert) console.log(`  ${r.display_id} [${r.priority}] ${r.title.slice(0, 80)}`);
for (const s of skipped) console.log(`  SKIP (exists): ${s.title.slice(0, 80)}`);

if (DRY) { console.log('\nDRY RUN — no writes'); process.exit(0); }
if (toInsert.length === 0) { console.log('\nNothing to insert.'); process.exit(0); }

const { data, error } = await sb.from('raid_entries').insert(toInsert).select('id, display_id, title');
if (error) { console.error('INSERT FAILED:', error); process.exit(1); }

console.log(`\nInserted ${data.length}:`);
for (const r of data) console.log(`  ${r.display_id}: ${r.title.slice(0, 70)}`);

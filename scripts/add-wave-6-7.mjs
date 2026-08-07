// Add Wave 6 + Wave 7 to WORKING UX project. All tasks are UX-only —
// hardcoded sample data / localStorage / placeholder flows. No real DB
// migrations, no real API integrations, no real storage writes. The
// goal is to demonstrate HOW the dashboard could function, not to ship
// working features.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project } = await sb.from('projects').select('id, org_id').eq('slug', 'working-ux').single();
const ORG_ID = project.org_id;
const PROJECT_ID = project.id;

const TODAY = '2026-05-05';

const waves = [
  {
    title: 'Wave 6 — Dashboard depth (UX-only — show HOW it functions, no real backend)',
    description: 'Demo-grade UI for missing dashboard surfaces. All hardcoded / localStorage / placeholder flows. Real wiring tracked separately.',
    priority: 'high',
    due_date: '2026-05-06',
    sort_order: 600,
    children: [
      { sort_order: 10, title: '/account/subscriptions page (UX)', priority: 'high', due_date: '2026-05-06',
        description: 'Sidebar link + list of subscription rows with status badges (Active / Expiring / Expired) + Renew + Extend buttons. Reads real Subscription rows where they exist, falls back to sample data when empty.' },
      { sort_order: 20, title: 'Bundle activation surface on /account/courses (UX)', priority: 'high', due_date: '2026-05-06',
        description: 'Pending-activation filter chip + per-row Activate button. Visual representation of Phase 4.10c bundle activation flow — real activation logic still tracked there.' },
      { sort_order: 30, title: 'Receipt download on /account/orders/[id] (UX)', priority: 'medium', due_date: '2026-05-06',
        description: 'Download receipt button on order detail. Links to BC hosted receipt URL or a placeholder PDF. No new pipeline.' },
      { sort_order: 40, title: 'Continue last course hero on /account (UX)', priority: 'high', due_date: '2026-05-06',
        description: 'Pick the most-recently-progressed in-progress enrollment, render as a hero card with Launch button above the stats row.' },
      { sort_order: 50, title: 'Account security link in /account/preferences (UX)', priority: 'medium', due_date: '2026-05-06',
        description: 'New "Account security" card with "Manage password & two-factor" → punches out to OneLogin issuer URL. Real link, no UI logic.' },
      { sort_order: 60, title: 'Saved billing address auto-fill on checkout (UX)', priority: 'medium', due_date: '2026-05-06',
        description: 'New "Use my saved address" radio on checkout customer step. Hardcoded sample address for demo; real BC-customer-address read deferred.' },
      { sort_order: 70, title: 'Profile avatar upload on /account/preferences (UX)', priority: 'medium', due_date: '2026-05-06',
        description: 'File picker + image preview. Persists as data URL in localStorage for demo (avoids Storage bucket setup). Header avatar reads from same. Real Supabase Storage avatar upload deferred.' },
    ],
  },
  {
    title: 'Wave 7 — Optional & integrative (UX-only)',
    description: 'Larger surface-area additions. UX-only.',
    priority: 'medium',
    due_date: '2026-05-07',
    sort_order: 700,
    children: [
      { sort_order: 10, title: 'Bookmarked courses (UX)', priority: 'medium', due_date: '2026-05-07',
        description: 'Enable bookmark icon on /courses list (currently disabled placeholder). New /account/bookmarks page + sidebar link. Bookmarks persist in localStorage. Real bookmarks table deferred.' },
      { sort_order: 20, title: 'Course progress detail page /account/courses/[id] (UX)', priority: 'medium', due_date: '2026-05-07',
        description: 'Per-enrollment detail with hardcoded lesson list, progress timeline, last-accessed timestamp, extension status. Real TI lesson-level integration deferred.' },
      { sort_order: 30, title: 'Cross-brand dashboard view (UX)', priority: 'medium', due_date: '2026-05-07',
        description: 'On /account overview, "You also have courses on [other brand]" section with hardcoded second-brand sample data. Real Phase 6 cross-brand aggregation deferred.' },
      { sort_order: 40, title: 'Notifications center (UX)', priority: 'medium', due_date: '2026-05-07',
        description: 'Bell icon in header with unread count + dropdown panel listing recent notifications (cert earned, course expiring, completion, etc.). Hardcoded sample data + localStorage persistence for read state. Real notifications table deferred.' },
    ],
  },
];

for (const wave of waves) {
  const { data: existingWave } = await sb.from('action_items')
    .select('id').eq('project_id', PROJECT_ID).eq('title', wave.title).maybeSingle();
  let waveId;
  if (existingWave) {
    waveId = existingWave.id;
    console.log(`rollup exists: ${wave.title}`);
  } else {
    const { data, error } = await sb.from('action_items').insert({
      org_id: ORG_ID,
      project_id: PROJECT_ID,
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
    console.log(`rollup: ${wave.title}`);
  }
  for (const child of wave.children) {
    const { data: ex } = await sb.from('action_items')
      .select('id').eq('project_id', PROJECT_ID).eq('parent_id', waveId).eq('title', child.title).maybeSingle();
    if (ex) { console.log(`  exists: ${child.title}`); continue; }
    const { error } = await sb.from('action_items').insert({
      org_id: ORG_ID, project_id: PROJECT_ID, parent_id: waveId,
      title: child.title, description: child.description, priority: child.priority,
      status: 'pending', due_date: child.due_date, sort_order: child.sort_order,
      first_flagged_at: TODAY,
    });
    if (error) throw error;
    console.log(`  ${child.title}`);
  }
}

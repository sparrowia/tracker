// Prefix the 24 audit-finding raid_entries titles with their severity code
// (C1, H1, M1, L1, …). Code is parsed from the first line of description
// (which we stored as `**Cx**` when inserting).
//
// Idempotent: skips rows whose title already starts with the code.
//
// Run: node scripts/_prefix-audit-titles.mjs [--dry-run]

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

const PROJECT_ID = 'e246c499-7f04-4b48-a2a2-e7cafc1aa371';

// Pull the audit findings (display_id I197..I220)
const { data: rows, error } = await sb.from('raid_entries')
  .select('id, display_id, title, description')
  .eq('project_id', PROJECT_ID)
  .in('display_id', Array.from({ length: 24 }, (_, i) => `I${197 + i}`));

if (error) { console.error(error); process.exit(1); }
console.log(`Found ${rows.length} target rows.`);

const CODE_RE = /^\*\*([CHML]\d+)\*\*/;
const updates = [];
const skipped = [];

for (const r of rows) {
  const m = r.description?.match(CODE_RE);
  if (!m) {
    skipped.push({ ...r, reason: 'no code in description' });
    continue;
  }
  const code = m[1];
  const prefix = `${code}: `;
  if (r.title.startsWith(prefix) || r.title.startsWith(`${code}:`) || r.title.startsWith(`[${code}]`)) {
    skipped.push({ ...r, reason: 'already prefixed' });
    continue;
  }
  updates.push({ id: r.id, display_id: r.display_id, code, oldTitle: r.title, newTitle: prefix + r.title });
}

console.log(`To update: ${updates.length}, skipped: ${skipped.length}\n`);
for (const u of updates) console.log(`  ${u.display_id} → "${u.newTitle.slice(0, 90)}"`);
for (const s of skipped) console.log(`  SKIP ${s.display_id}: ${s.reason}`);

if (DRY) { console.log('\nDRY RUN — no writes'); process.exit(0); }
if (updates.length === 0) { console.log('\nNothing to update.'); process.exit(0); }

// Apply one-by-one (no Postgres batch update via the JS client without raw SQL)
let ok = 0;
let failed = 0;
for (const u of updates) {
  const { error: upErr } = await sb.from('raid_entries').update({ title: u.newTitle }).eq('id', u.id);
  if (upErr) { console.error(`  FAILED ${u.display_id}: ${upErr.message}`); failed++; }
  else ok++;
}
console.log(`\nUpdated: ${ok}, failed: ${failed}`);

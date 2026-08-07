// Set status=needs_verification on the audit findings closed by commits
// e567101 (C1) and 6fb393b (C2 + bundled fixes for H1/H3/H4/M3).
// Per tracker convention, resolved_at left null so the tasks stay on the
// main board for the audit-verification pass.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

// display_id → (severity code, fixed-in commit)
const TARGETS = [
  { display_id: 'I197', code: 'C1', commit: 'e567101' },
  { display_id: 'I198', code: 'C2', commit: '6fb393b' },
  { display_id: 'I199', code: 'H1', commit: '6fb393b' },
  { display_id: 'I201', code: 'H3', commit: '6fb393b' },
  { display_id: 'I202', code: 'H4', commit: '6fb393b' },
  { display_id: 'I210', code: 'M3', commit: 'e567101' },
];

const { data: rows, error } = await sb.from('raid_entries')
  .select('id, display_id, status, title')
  .in('display_id', TARGETS.map(t => t.display_id));
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${rows.length}/${TARGETS.length} target rows.${DRY ? ' [DRY RUN]' : ''}\n`);

let toUpdate = 0;
for (const t of TARGETS) {
  const row = rows.find(r => r.display_id === t.display_id);
  if (!row) {
    console.log(`  MISSING ${t.display_id} (${t.code})`);
    continue;
  }
  if (row.status === 'needs_verification') {
    console.log(`  SKIP    ${t.display_id} (${t.code}) — already needs_verification`);
    continue;
  }
  console.log(`  UPDATE  ${t.display_id} (${t.code}) ${row.status} → needs_verification [${t.commit}]`);
  toUpdate++;
}

if (DRY || toUpdate === 0) { console.log('\nNo writes.'); process.exit(0); }

let ok = 0, failed = 0;
for (const t of TARGETS) {
  const row = rows.find(r => r.display_id === t.display_id);
  if (!row || row.status === 'needs_verification') continue;
  const { error: upErr } = await sb.from('raid_entries')
    .update({ status: 'needs_verification' })
    .eq('id', row.id);
  if (upErr) { console.error(`  FAILED ${t.display_id}: ${upErr.message}`); failed++; }
  else ok++;
}
console.log(`\nUpdated: ${ok}, failed: ${failed}`);

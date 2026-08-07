// Flip H2/H5/H6 audit findings to needs_verification after commit 253eadf.
// Same pattern as the prior _audit-findings-verify.mjs.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

const TARGETS = [
  { display_id: 'I200', code: 'H2', commit: '253eadf' },
  { display_id: 'I203', code: 'H5', commit: '253eadf' },
  { display_id: 'I204', code: 'H6', commit: '253eadf' },
];

const { data: rows, error } = await sb.from('raid_entries')
  .select('id, display_id, status, title')
  .in('display_id', TARGETS.map(t => t.display_id));
if (error) { console.error(error); process.exit(1); }

console.log(`Found ${rows.length}/${TARGETS.length} target rows.${DRY ? ' [DRY RUN]' : ''}\n`);

let toUpdate = 0;
for (const t of TARGETS) {
  const row = rows.find(r => r.display_id === t.display_id);
  if (!row) { console.log(`  MISSING ${t.display_id} (${t.code})`); continue; }
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

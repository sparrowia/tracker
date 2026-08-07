// Flip H7/H8/L1/L2/L3/L4 audit findings to needs_verification after
// commit 9bd557f.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = process.argv.includes('--dry-run');

const TARGETS = [
  { display_id: 'I205', code: 'H7' },
  { display_id: 'I206', code: 'H8' },
  { display_id: 'I217', code: 'L1' },
  { display_id: 'I218', code: 'L2' },
  { display_id: 'I219', code: 'L3' },
  { display_id: 'I220', code: 'L4' },
];
const COMMIT = '9bd557f';

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
  console.log(`  UPDATE  ${t.display_id} (${t.code}) ${row.status} → needs_verification [${COMMIT}]`);
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

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug', 'internal-development').single();
const PID = project.id;

async function rename(oldT, newT) {
  const { data: row } = await sb.from('action_items').select('id').eq('project_id', PID).eq('title', oldT).maybeSingle();
  if (!row) { console.log(`  SKIP: ${oldT}`); return; }
  await sb.from('action_items').update({ title: newT }).eq('id', row.id);
  console.log(`  ✓ ${oldT} → ${newT}`);
}

// Phase 6 children — preserve inner numbers per "B"
await rename('4.6 Account pages', '6.6 Account pages');
await rename('4.7 Support form', '6.7 Support form');

// POST-MVP children — drop phase numbers (no phase number for POST-MVP per Matt)
await rename('[POST-MVP] 6.1 Dashboard package', '[POST-MVP] Dashboard package');
await rename('[POST-MVP] 6.2 Embed in storefront', '[POST-MVP] Embed in storefront');
await rename('[POST-MVP] 8.1 BenchPrep → Snowflake reconciliation', '[POST-MVP] BenchPrep → Snowflake reconciliation');
await rename('[POST-MVP] 8.2 TI → BI Connector reconciliation', '[POST-MVP] TI → BI Connector reconciliation');
await rename('[POST-MVP] 8.3 Salesforce data sync', '[POST-MVP] Salesforce data sync');
await rename('[POST-MVP] 8.4 Reconciliation monitoring', '[POST-MVP] Reconciliation monitoring');
await rename('[POST-MVP] 8.5 Certificate reconciliation hook', '[POST-MVP] Certificate reconciliation hook');

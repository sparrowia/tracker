import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug','internal-development').single();
const { data: items } = await sb.from('action_items')
  .select('id, title, status, parent_id, sort_order')
  .eq('project_id', project.id)
  .order('sort_order', { ascending: true });
const byParent = {};
for (const i of items) (byParent[i.parent_id || 'ROOT'] ||= []).push(i);

const phaseTitles = ['Phase 3: Integration Packages','Phase 5: Cart + Checkout + Enrollment','Phase 11: First Brand Launch — DC Hours'];
for (const pt of phaseTitles) {
  const p = items.find(i => i.title === pt);
  console.log(`\n=== ${pt} (${p.status}) ===`);
  for (const k of (byParent[p.id] || [])) {
    console.log(`  [${k.status.padEnd(11)}] ${k.title}`);
  }
}

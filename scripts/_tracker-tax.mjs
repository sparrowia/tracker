import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug','internal-development').single();
const { data, error } = await sb.from('action_items')
  .select('id, title, status, parent_id')
  .eq('project_id', project.id);
if (error) { console.error(error); process.exit(1); }
const titleById = Object.fromEntries(data.map(d=>[d.id,d.title]));
const matches = data.filter(d => /avalara|\btax\b|sales.*record|system.*record|sales data|transaction record/i.test(d.title));
for (const m of matches) {
  const parent = m.parent_id ? titleById[m.parent_id] : 'ROOT';
  console.log(`[${m.status}] ${m.title}  (parent: ${parent})`);
}
console.log(`\n${matches.length} matches`);

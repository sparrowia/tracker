import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug','internal-development').single();
const { data: phase11 } = await sb.from('action_items')
  .select('id, title, description')
  .eq('project_id', project.id)
  .eq('title', '11.1 DC Hours brand configuration')
  .single();
console.log('=== 11.1 description ===');
console.log(phase11.description || '(empty)');

// Also pull 11.4 cert template + 11.5 QA + 11.6 launch
for (const t of ['11.4 DC Hours certificate template', '11.5 DC Hours QA', '11.6 DC Hours launch', '11.2 DC Hours Vercel deployment', '11.3 DC Hours content + design']) {
  const { data: it } = await sb.from('action_items')
    .select('id, title, status, description')
    .eq('project_id', project.id).eq('title', t).single();
  if (!it) { console.log(`\nNOT FOUND: ${t}`); continue; }
  console.log(`\n=== ${it.title} [${it.status}] ===`);
  console.log((it.description || '(empty)').slice(0, 400));
}

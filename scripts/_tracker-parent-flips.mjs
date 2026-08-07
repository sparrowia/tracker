import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug','internal-development').single();
for (const title of ['Phase 3: Integration Packages', 'Phase 5: Cart + Checkout + Enrollment']) {
  const { error } = await sb.from('action_items').update({ status: 'in_progress' })
    .eq('project_id', project.id).eq('title', title);
  console.log(`${title} → in_progress: ${error ? error.message : 'OK'}`);
}

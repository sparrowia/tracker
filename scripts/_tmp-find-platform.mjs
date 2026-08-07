import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local', 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: projects, error } = await sb.from('projects').select('id, slug, name, health, initiative_id, steering_phase').order('name');
if (error) { console.log('ERR', error); process.exit(1); }
console.log('=== ALL PROJECTS ===');
for (const p of projects) console.log(`${p.slug.padEnd(34)} | ${(p.name||'').padEnd(50)} | ${p.health||'-'} | ${p.steering_phase||'-'}`);

const { data: inits } = await sb.from('initiatives').select('id, slug, name, health, steering_phase').order('name');
console.log('\n=== INITIATIVES ===');
for (const i of inits||[]) console.log(`${i.slug.padEnd(34)} | ${(i.name||'').padEnd(50)} | ${i.health||'-'} | ${i.steering_phase||'-'}`);

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/matthewlobel/projects/edcetera-pm/.env.local','utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a,l)=>{const[k,...v]=l.split('=');a[k.trim()]=v.join('=').trim();return a;},{});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: project } = await sb.from('projects').select('id').eq('slug','internal-development').single();
const { data: items } = await sb.from('action_items')
  .select('id, title, status, parent_id, sort_order, resolved_at, updated_at, description')
  .eq('project_id', project.id)
  .order('sort_order', { ascending: true });

const byParent = {};
for (const i of items) {
  const k = i.parent_id || 'ROOT';
  (byParent[k] ||= []).push(i);
}

function tree(parentId, depth=0) {
  const kids = byParent[parentId] || [];
  for (const k of kids) {
    const archived = k.resolved_at ? '[A]' : '   ';
    const indent = '  '.repeat(depth);
    const updated = k.updated_at ? k.updated_at.slice(0,10) : '';
    console.log(`${indent}${archived}[${k.status.padEnd(11)}] ${updated} ${k.title}`);
    tree(k.id, depth+1);
  }
}

// Drill into the in-progress / pending phases + Phase 5 (Cart/Checkout/Enrollment) for the CE E2E story
const targets = items.filter(i =>
  !i.parent_id && (
    i.title.startsWith('Phase 9') ||
    i.title.startsWith('Phase 10') ||
    i.title.startsWith('Phase 11') ||
    i.title.startsWith('Phase 12') ||
    i.title.startsWith('Phase 5:') ||
    i.title.startsWith('Phase 4:')
  )
);
for (const t of targets) {
  console.log(`\n=== ${t.title} (${t.status}) ===`);
  tree(t.id, 0);
}

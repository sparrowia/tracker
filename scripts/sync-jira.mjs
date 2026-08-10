// Manual refresh of the Unified 2 roadmap from the live U2 Jira board.
//
//   node scripts/sync-jira.mjs            # dry run — prints the plan, writes nothing
//   node scripts/sync-jira.mjs --apply
//
// This is a thin CLI over src/lib/jira-sync.mjs, which holds ALL the sync
// rules (release-date scheduling, protected fields) and is also what the
// 15-minute Vercel cron at /api/jira/sync runs. Edit the rules there, not here.

import { readFileSync } from 'fs';
import { runJiraSync } from '../src/lib/jira-sync.mjs';

const APPLY = process.argv.includes('--apply');

const readEnv = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .reduce((a, l) => { const [k, ...v] = l.split('='); a[k.trim()] = v.join('=').trim().replace(/^"|"$/g, ''); return a; }, {});

const env = readEnv('/Users/matthewlobel/projects/edcetera-pm/.env.local');
// Jira credentials live with the platform repo (that's where the REST token is
// configured); read them from there rather than duplicating the secret.
const platformEnv = readEnv('/Volumes/Avalon/Working/edcetera-platform/.env.local');

const summary = await runJiraSync({
  jiraEmail: platformEnv.JIRA_EMAIL,
  jiraToken: platformEnv.JIRA_API_TOKEN,
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
  apply: APPLY,
});

if (!APPLY) console.log('\nDRY RUN — nothing written. Re-run with --apply.');
console.log(JSON.stringify(summary));

# Edcetera PM Tracker

Project management and knowledge management tool for tracking vendors, projects, blockers, action items, and RAID logs. Built with Next.js 16 (App Router), Supabase, and Tailwind CSS 4.

- **Production:** [edcet-tracker.vercel.app](https://edcet-tracker.vercel.app) (auto-deploys from `main` via Vercel)
- **Repo:** [github.com/sparrowia/tracker](https://github.com/sparrowia/tracker)

## Documentation

| Document | Purpose |
|----------|---------|
| [`PROJECT.md`](./PROJECT.md) | Full overview: stack, database schema, features, UI system, migrations, deployment |
| [`CLAUDE.md`](./CLAUDE.md) | Coding conventions, guardrails, and multi-project environment warnings |
| [`src/lib/types.ts`](./src/lib/types.ts) | All TypeScript interfaces and enums |
| [`src/lib/utils.ts`](./src/lib/utils.ts) | Formatting helpers (priority colors, status badges, dates) |
| [`supabase/migrations/`](./supabase/migrations) | Full database schema history |

## Development

```bash
npm run dev    # local dev server (http://localhost:3000)
npm run build  # production build — always run before pushing
```

## Environment Variables

See [`PROJECT.md`](./PROJECT.md#environment-variables). Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, plus Slack/SMTP keys for notifications.

## Database Migrations

```bash
npx supabase --workdir . db push
```

## Deployment

Commits to `main` auto-deploy to production via Vercel. Always `npm run build` before pushing. Do **not** use `npx vercel` — the CLI is scoped to a different Vercel team.

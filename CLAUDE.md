# CLAUDE.md - Edcetera PM Tracker

## Project Overview

Edcetera project management / knowledge management tool. Next.js 16 (App Router) + Supabase + Tailwind CSS 4.

- **Repo:** github.com/sparrowia/tracker
- **Vercel Project:** tracker-sable-rho
- **Production URL:** tracker-sable-rho.vercel.app
- **Deployment:** Vercel auto-deploys from `main`. Always commit + push to main after changes — Matt tests on deployed Vercel, not localhost.

## Multi-Project Environment

Matt has multiple projects across different directories and Vercel accounts. **Always verify you are working in the correct project before running commands.**

- **This project:** `/Users/matthewlobel/projects/edcetera-pm` → Vercel: `tracker-sable-rho`
- **Edcetera support portal:** `/Users/matthewlobel/Repositories/edcet` → Vercel: `edcet` (under `avalon-adventures` team)
- **Project management docs:** `/Users/matthewlobel/Repositories/edcet/project-management` → markdown files, no deployment
- **Other projects exist** (LivingTale, Avalon Adventures) — never assume. Always check `pwd` and `.vercel/project.json` before deploying.

**Vercel CLI note:** The CLI is authenticated to the `avalon-adventures` team (`matt-7913`), which does NOT have access to `tracker-sable-rho`. That project lives under a different Vercel scope. Do not use `npx vercel` for this project — rely on git push auto-deploy instead.

## Tech Stack

- Next.js 16 (App Router, `src/app/`)
- Supabase (auth, database, RPC functions like `generate_vendor_agenda`, views like `blocker_ages`/`action_item_ages`/`vendor_accountability`)
- Tailwind CSS 4
- TypeScript
- Tesseract.js (client-side OCR for image intake)
- DeepSeek API (extraction/synthesis via `/api/extract` route)
- Fathom API (meeting transcript intake — planned)

## Key Directories

```
src/
├── app/
│   ├── (app)/                    # Authenticated routes
│   │   ├── dashboard/            # Weekly command center
│   │   ├── agendas/              # Agenda index (vendor list)
│   │   │   └── [vendorSlug]/     # Vendor-specific agenda (uses AgendaView component)
│   │   ├── blockers/             # Active blockers list
│   │   ├── vendors/              # Vendor cards + detail pages
│   │   │   └── [id]/             # Vendor detail (contacts, accountability)
│   │   ├── projects/             # Project list + detail pages
│   │   │   └── [slug]/           # Project detail (blockers, actions, RAID log)
│   │   ├── people/               # Internal team + vendor contacts
│   │   ├── intake/               # Raw text/image intake with OCR
│   │   │   └── [id]/review/      # Review extracted items
│   │   └── settings/             # Term corrections for AI extraction
│   ├── (auth)/login/             # Auth page
│   └── api/extract/              # DeepSeek extraction endpoint
├── components/
│   ├── agenda-view.tsx           # Asana-style list layout for vendor agendas
│   ├── sidebar.tsx               # App navigation sidebar
│   └── topbar.tsx                # Top bar
└── lib/
    ├── types.ts                  # All TypeScript interfaces
    ├── utils.ts                  # Formatting helpers (priorityColor, formatAge, etc.)
    └── supabase/                 # Supabase client/server/middleware setup
```

## UI Design System

The app uses a consistent Asana-inspired visual style across all pages:

- **Section headers:** Dark bars (`bg-gray-800`) with white uppercase text — used for every data section
- **Sub-section headers:** `bg-gray-700` (used in RAID log quadrants on project detail)
- **Blocker sections:** `bg-red-800` dark bar for blocker-specific headers
- **Table column headers:** `bg-gray-50` with `border-b border-gray-300` separator
- **Container borders:** `border-gray-300` (outer), `border-gray-200` (row dividers)
- **Item titles:** Always `font-semibold`
- **Responsible column:** Blue initials avatar (`bg-blue-100 text-blue-700`) + full name; shows "Unassigned" in italic when empty
- **Priority badges:** Colored rounded pills via `priorityColor()` from utils.ts
- **Cards:** `border-gray-300` with `hover:border-blue-400`
- **Priority group headers (agenda view):** Dark bars with colored priority dots, collapsible

## Key Data Models

Defined in `src/lib/types.ts`:

- **Vendor** — external companies (Silk, BenchPrep, etc.)
- **Person** — internal team or vendor contacts
- **Project** — tracked projects with health status
- **ActionItem** — tasks with owner, priority, due date, age
- **Blocker** — blocking issues with impact description
- **AgendaItem** — vendor meeting topics with severity/context/ask
- **RaidEntry** — risks, actions, issues, decisions
- **SupportTicket** — external support requests
- **Intake** — raw text submissions for AI extraction
- **VendorAgendaRow** — RPC output for ranked agenda generation
- **VendorAccountabilityRow** — combined view of vendor action items + blockers

## Development

```bash
npm run dev    # local dev server (port 3000)
npm run build  # production build — always run before pushing
```

## Deployment

- Commits to `main` auto-deploy to production via Vercel
- For experimental UI changes, use a branch, then merge to main when approved
- Do NOT use `npx vercel` — CLI is scoped to wrong team
- Always `npm run build` before pushing to catch errors

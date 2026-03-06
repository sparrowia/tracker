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
- pdfjs-dist (client-side PDF text extraction)
- DeepSeek API (extraction/synthesis via `/api/extract` route)
- Deterministic Asana parser (`lib/parsers/asana.ts`) — bypasses AI for Asana PDF exports

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
│   ├── project-tabs.tsx          # Project detail tabs (blockers, actions, RAID, intake)
│   ├── raid-log.tsx              # RAID log with configurable columns, filters, archived view
│   ├── comment-thread.tsx        # Threaded comments with file attachments
│   ├── owner-picker.tsx          # Person selection dropdown with inline creation
│   ├── vendor-picker.tsx         # Vendor selection dropdown with inline creation
│   ├── sidebar.tsx               # App navigation sidebar
│   └── topbar.tsx                # Top bar
└── lib/
    ├── types.ts                  # All TypeScript interfaces
    ├── utils.ts                  # Formatting helpers (priorityColor, formatAge, etc.)
    ├── pdf.ts                    # Client-side PDF text extraction
    ├── ai/                       # DeepSeek client, context builder, prompts
    ├── parsers/asana.ts          # Deterministic Asana PDF export parser
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
- **Expanded detail panels:** Property-table layout — editable title, label/value grid rows (`grid-cols-[120px_1fr_120px_1fr]`), description/notes below. Consistent across RAID log, blockers, action items.
- **Reporter column:** Purple initials avatar (`bg-purple-100 text-purple-700`) — distinct from blue owner avatar
- **RAID log filters:** Priority, status, owner, age dropdowns; active filters highlight blue; header shows filtered/total count
- **RAID archived view:** "Archived (N)" text link below type tabs; flat list sorted by resolved_at desc; type label, priority, owner, resolved date columns; reopen button
- **Resolve animation:** Inline `transition: all 350ms ease-out` — green flash + fade + collapse
- **Comments:** Below description in expanded detail panels; auto-author from logged-in user; Cmd+Enter posting; file attachments via Supabase Storage bucket `comment-attachments`
- **VendorPicker:** Inline "+ Add Vendor" creation, same pattern as OwnerPicker

## Key Data Models

Defined in `src/lib/types.ts`:

- **Vendor** — external companies (Silk, BenchPrep, etc.)
- **Person** — internal team or vendor contacts
- **Project** — tracked projects with health status
- **ActionItem** — tasks with owner, priority, due date, age
- **Blocker** — blocking issues with impact description
- **AgendaItem** — vendor meeting topics with severity/context/ask
- **RaidEntry** — risks, assumptions, issues, decisions (with owner + reporter)
- **Comment** — threaded comments on RAID entries, action items, blockers (polymorphic parent)
- **CommentAttachment** — file attachments on comments (Supabase Storage)
- **SupportTicket** — external support requests
- **Intake** — raw text submissions for AI extraction
- **VendorAgendaRow** — RPC output for ranked agenda generation
- **VendorAccountabilityRow** — combined view of vendor action items + blockers

## Development

```bash
npm run dev    # local dev server (port 3000)
npm run build  # production build — always run before pushing
```

## Supabase Migrations

You have full access to run migrations via the Supabase CLI:

```bash
npx supabase --workdir /Users/matthewlobel/projects/edcetera-pm db push
```

This connects to the remote database and applies any pending migrations from `supabase/migrations/`. Do NOT waste time trying psql, pg clients, REST API workarounds, or telling the user to do it manually — just run `npx supabase db push` with the `--workdir` flag.

## Deployment

- Commits to `main` auto-deploy to production via Vercel
- For experimental UI changes, use a branch, then merge to main when approved
- Do NOT use `npx vercel` — CLI is scoped to wrong team
- Always `npm run build` before pushing to catch errors

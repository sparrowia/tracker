# Edcetera PM Tracker

Project management and knowledge management tool for tracking vendors, projects, blockers, action items, and RAID logs.

## Links

| Resource | URL |
|----------|-----|
| Repo | [github.com/sparrowia/tracker](https://github.com/sparrowia/tracker) |
| Production | [tracker-sable-rho.vercel.app](https://tracker-sable-rho.vercel.app) |
| Vercel Project | `tracker-sable-rho` (auto-deploys from `main`) |
| Supabase | Project dashboard (check `.env.local` for URL) |

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Database:** Supabase (PostgreSQL + Auth + RLS + RPC)
- **Styling:** Tailwind CSS 4, Lucide React icons
- **AI:** DeepSeek V3 — extraction, call notes, Q&A
- **OCR:** Tesseract.js (client-side image intake)
- **PDF:** pdfjs-dist (client-side PDF text extraction)
- **Spreadsheets:** xlsx (import/export)
- **Parsers:** Deterministic Asana PDF export parser (bypasses AI)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL (public)
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anon key (public)
DEEPSEEK_API_KEY              # DeepSeek API key (server-only)
```

## Directory Structure

```
src/
├── app/
│   ├── (app)/                # Authenticated routes
│   │   ├── dashboard/        # Weekly command center
│   │   ├── agendas/          # Vendor agenda index
│   │   │   └── [vendorSlug]/ # Vendor-specific agenda (AgendaView)
│   │   ├── vendors/          # Vendor cards + detail
│   │   │   └── [id]/         # Contacts, accountability
│   │   ├── projects/         # Project list + detail
│   │   │   └── [slug]/       # Blockers, actions, RAID log
│   │   ├── initiatives/      # Initiative list + detail
│   │   │   └── [slug]/
│   │   ├── blockers/         # Active blockers list
│   │   ├── intake/           # Raw text/image intake + OCR
│   │   │   └── [id]/review/  # Review AI-extracted items
│   │   ├── ask/              # AI Q&A page
│   │   ├── people/           # Internal team + vendor contacts
│   │   └── settings/         # Term corrections, vendor/people management
│   ├── (auth)/login/         # Login page
│   ├── auth/callback/        # Supabase OAuth callback
│   └── api/
│       ├── extract/          # DeepSeek extraction from intake
│       │   └── suggest-mapping/
│       ├── agenda-notes/     # AI call notes processing
│       ├── ask/              # Conversational Q&A
│       └── match/            # Entity matching/search
├── components/
│   ├── agenda-view.tsx       # Asana-style agenda with priority groups
│   ├── project-tabs.tsx      # Tab nav + staging area for AI suggestions
│   ├── raid-log.tsx          # RAID quadrants (Risk/Assumption/Issue/Decision)
│   ├── project-header.tsx    # Project name + health badge
│   ├── editable-project-name.tsx
│   ├── add-project-button.tsx
│   ├── add-initiative-button.tsx
│   ├── owner-picker.tsx      # Person selection dropdown
│   ├── undo-toast.tsx        # Undo notification
│   ├── sidebar.tsx           # Left nav
│   └── topbar.tsx            # Top bar
└── lib/
    ├── types.ts              # All TypeScript interfaces + enums
    ├── utils.ts              # Formatting helpers (priority, status, dates, etc.)
    ├── pdf.ts                # Client-side PDF text extraction (pdfjs-dist)
    ├── ai/
    │   ├── deepseek.ts       # DeepSeek API client
    │   ├── context.ts        # Context building for AI calls
    │   └── prompts/          # System prompts for extraction/notes/Q&A
    ├── parsers/
    │   └── asana.ts          # Deterministic Asana PDF export parser
    └── supabase/
        ├── client.ts         # Browser Supabase client
        ├── server.ts         # Server Supabase client
        └── middleware.ts     # Session refresh middleware
```

## Database Schema

### Core Tables
| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant org isolation |
| `profiles` | User accounts linked to auth |
| `vendors` | External companies (Silk, BenchPrep, etc.) |
| `people` | Internal team + vendor contacts |
| `initiatives` | High-level strategic initiatives |
| `projects` | Tracked projects with health status |
| `action_items` | Tasks with owner, priority, due date, meeting toggle |
| `blockers` | Blocking issues with impact description |
| `raid_entries` | Risks, assumptions, issues, decisions (with owner + reporter) |
| `agenda_items` | Vendor/project meeting topics with severity/context/ask |
| `support_tickets` | External support requests |
| `intakes` | Raw text submissions for AI extraction |
| `meetings` | Meeting records |
| `activity_log` | Audit trail |
| `term_corrections` | AI extraction glossary (wrong_term → correct_term) |

### Junction Tables
`project_vendors`, `meeting_projects`, `meeting_attendees`, `intake_entities`, `correction_log`

### Views
- `blocker_ages` — blockers with computed age
- `action_item_ages` — action items with computed age
- `vendor_accountability` — combined action items + blockers per vendor

### RPC Functions
- `generate_vendor_agenda(vendor_id, limit)` — ranked vendor agenda with scoring
- `generate_project_agenda(project_id, limit)` — ranked project agenda
- `generate_project_agenda_from_selected(project_id, limit)` — agenda from items toggled for meeting (`include_in_meeting = true`)

### Key Enums
- **item_status:** pending, in_progress, complete, needs_verification, paused, at_risk, blocked, identified, assessing, mitigated, closed
- **priority_level:** critical, high, medium, low
- **project_health:** on_track, in_progress, at_risk, blocked, paused, complete
- **raid_type:** risk, assumption, issue, decision
- **severity_indicator:** critical, high, new, normal
- **intake_source:** slack, email, meeting_notes, manual, fathom_transcript, spreadsheet, asana

### Security
All tables have row-level security policies scoped to `org_id` via the `user_org_id()` helper function.

## Key Features

1. **Vendor Accountability** — track action items + blockers per vendor with age and escalation counts
2. **Project RAID Log** — four-quadrant Risk/Assumption/Issue/Decision matrix with configurable columns (priority, status, owner, reporter, vendor, age, escalations, flagged), filters (priority/status/owner/age), and property-table detail view
3. **Meeting Agenda** — toggle items for meeting inclusion via bell icon; auto-ranked by priority/severity/age/escalation score
4. **AI Call Notes** — paste meeting notes on any item; DeepSeek updates fields + suggests new items in a staging area
5. **AI Intake** — paste raw text, upload images (OCR), drop PDFs, or import spreadsheets; DeepSeek extracts structured items with 90s timeout and error recovery
6. **PDF Intake** — drag-and-drop PDF files on both standalone intake and project intake panel; client-side text extraction via pdfjs-dist with position-based spacing
7. **Asana Parser** — deterministic parser for Asana PDF exports; bypasses AI entirely for structured text extraction (separator-based block splitting, field parsing, person matching)
8. **Intelligent Scoring** — RPC-based agenda ranking: `priority_score + severity_score + escalation_count*10 + min(age,30)*2`

## UI Design System

- **Section headers:** `bg-gray-800` dark bars, white uppercase text
- **Sub-sections:** `bg-gray-700`; blocker sections: `bg-red-800`
- **Table headers:** `bg-gray-50` with `border-gray-300`
- **Borders:** `gray-300` outer, `gray-200` row dividers
- **Item titles:** `font-semibold`
- **Responsible column:** blue initials avatar (`bg-blue-100 text-blue-700`) + full name
- **Priority badges:** colored pills via `priorityColor()` in `lib/utils.ts`
- **Agenda view:** Asana-style collapsible priority groups with dark bar headers
- **Expanded detail:** Property-table layout — editable title at top, label/value grid with subtle gray label backgrounds, description/notes below, actions bar at bottom. Consistent across RAID log, blockers, and action items.
- **Reporter column:** Purple initials avatar (`bg-purple-100 text-purple-700`) to distinguish from blue owner avatar

## Migrations

All in `supabase/migrations/`:

| File | Description |
|------|-------------|
| `20260224000001_initial_schema.sql` | Core tables, enums, views, RLS, `generate_vendor_agenda` RPC |
| `20260224000002_term_corrections.sql` | AI glossary table |
| `20260302000001_initiatives_and_project_agenda.sql` | Initiatives table, `generate_project_agenda` RPC |
| `20260302000002_agenda_rpc_include_raid.sql` | Add RAID entries to vendor agenda RPC |
| `20260304000001_include_in_meeting.sql` | Meeting toggle + `generate_project_agenda_from_selected` RPC |
| `20260304000002_risk_statuses.sql` | Extended RAID status values |
| `20260305000001_fix_selected_agenda_rpc.sql` | Fix RAID type filter + remove status filters from selected agenda |
| `20260305000002_correction_log.sql` | Correction logging table |
| `20260305000003_add_asana_source.sql` | Add `asana` to intake_source enum |
| `20260305000004_raid_reporter.sql` | Add `reporter_id` to raid_entries |

## Deployment

```bash
npm run build   # always build before pushing
git push origin main   # auto-deploys to Vercel
```

Do NOT use `npx vercel` — the CLI is scoped to the wrong Vercel team. Rely on git push auto-deploy only.

## Related Documentation

All docs live in this repo: [github.com/sparrowia/tracker](https://github.com/sparrowia/tracker)

| Document | Purpose |
|----------|---------|
| [`CLAUDE.md`](https://github.com/sparrowia/tracker/blob/main/CLAUDE.md) | AI assistant instructions, conventions, and guardrails |
| [`src/lib/types.ts`](https://github.com/sparrowia/tracker/blob/main/src/lib/types.ts) | All TypeScript interfaces and enums |
| [`src/lib/utils.ts`](https://github.com/sparrowia/tracker/blob/main/src/lib/utils.ts) | Formatting helpers (priority colors, status badges, dates) |
| [`supabase/migrations/`](https://github.com/sparrowia/tracker/tree/main/supabase/migrations) | Full database schema history (10 migrations) |
| [`.env.local.example`](https://github.com/sparrowia/tracker/blob/main/.env.local.example) | Required environment variables |
| [`PROMPT.md`](https://github.com/sparrowia/tracker/blob/main/PROMPT.md) | Bootstrap prompt for AI assistants |

# Edcetera PM Tracker

Project management and knowledge management tool for tracking vendors, projects, blockers, action items, and RAID logs.

## Links

| Resource | URL |
|----------|-----|
| Repo | [github.com/sparrowia/tracker](https://github.com/sparrowia/tracker) |
| Production | [edcet-tracker.vercel.app](https://edcet-tracker.vercel.app) |
| Vercel Project | `edcet-tracker` (auto-deploys from `main`) |
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
│   ├── vendor-agenda-view.tsx # Vendor-specific agenda (same layout as agenda-view)
│   ├── project-tabs.tsx      # Tab nav + staging area for AI suggestions
│   ├── raid-log.tsx          # RAID quadrants with subtasks, drag-and-drop, archived view
│   ├── comment-thread.tsx    # Reusable comment thread with file attachments
│   ├── vendor-picker.tsx     # Vendor selection dropdown with inline creation
│   ├── project-header.tsx    # Project name + health badge
│   ├── editable-project-name.tsx
│   ├── add-project-button.tsx
│   ├── add-initiative-button.tsx
│   ├── owner-picker.tsx      # Person selection dropdown
│   ├── wiki-editor.tsx       # Wiki page editor (block-based)
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
| `people` | Internal team + vendor contacts (includes `slack_member_id` for DM links) |
| `initiatives` | High-level strategic initiatives |
| `projects` | Tracked projects with health status |
| `action_items` | Tasks with owner, priority, due date, meeting toggle |
| `blockers` | Blocking issues with impact description |
| `raid_entries` | Risks, assumptions, issues, decisions (owner, reporter, parent_id subtasks, sort_order) |
| `agenda_items` | Vendor/project meeting topics with severity/context/ask |
| `support_tickets` | External support requests |
| `intakes` | Raw text submissions for AI extraction |
| `comments` | Threaded comments on RAID entries, action items, blockers (polymorphic) |
| `comment_attachments` | File attachments on comments (Supabase Storage) |
| `meetings` | Meeting records |
| `activity_log` | Audit trail |
| `term_corrections` | AI extraction glossary (wrong_term → correct_term) |
| `milestones` | Company timeline milestones with parent/child grouping |
| `wiki_pages` | Block-based wiki pages with parent/child hierarchy |

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
2. **Project RAID Log** — four-quadrant Risk/Assumption/Issue/Decision matrix with configurable columns, filters, property-table detail view, subtasks (parent-child via `parent_id`), and drag-and-drop reordering/nesting (sort_order persisted)
3. **RAID Column Sorting** — Issue Name, Priority, and Status column headers are clickable sort toggles (asc → desc → off). Only one sort active at a time; clicking one resets the others. Priority order: Critical→High→Medium→Low. Status order: Blocked→At Risk→Identified→Pending→In Progress→Assessing→Needs Verification→Paused→Mitigated→Complete→Closed.
4. **RAID Bulk Actions** — multi-select via checkbox or Shift+click range select; floating toolbar for bulk Priority, Status, Owner, Nest, Group, Delete. Status dropdown is dynamically derived from the raid_types of selected items (risks get risk statuses, issues/assumptions get issue statuses, decisions get decision statuses, mixed selections show union).
5. **Meeting Agenda** — toggle items for meeting inclusion via bell icon; auto-ranked by priority/severity/age/escalation score
6. **AI Call Notes** — paste meeting notes on any item; DeepSeek updates fields + suggests new items in a staging area
7. **AI Intake** — paste raw text, upload images (OCR), drop PDFs, or import spreadsheets; DeepSeek extracts structured items with 90s timeout and error recovery
8. **PDF Intake** — drag-and-drop PDF files on both standalone intake and project intake panel; client-side text extraction via pdfjs-dist with position-based spacing
9. **Asana Parser** — deterministic parser for Asana PDF exports; bypasses AI entirely for structured text extraction (separator-based block splitting, field parsing, person matching)
10. **Intelligent Scoring** — RPC-based agenda ranking: `priority_score + severity_score + escalation_count*10 + min(age,30)*2`
11. **Comments & Attachments** — threaded comments on RAID entries, action items, and blockers with file attachment support (Supabase Storage). Author auto-detected from logged-in user. Newest-first display with Cmd+Enter posting.
12. **RAID Archived View** — "Archived" link below RAID type tabs shows all resolved items sorted by resolution date. Type label replaces ID, reopen button on each row. Resolve animation: green flash + collapse (350ms ease-out).
13. **Vendor Picker** — all org vendors shown in RAID/Actions/Blockers detail panels with inline "+ Add Vendor" creation (like OwnerPicker for people)
14. **RAID Subtasks** — self-referencing `parent_id` on raid_entries. Disclosure triangle toggles children visible/hidden. Children indented with ↳ arrow. Parent dropdown in detail panel.
15. **RAID Drag-and-Drop** — native HTML5 drag-and-drop for reordering and nesting. Top/bottom 25% = reorder (blue line indicator), middle 50% = nest as subtask (blue highlight). Sort order via `sort_order` integer column with midpoint gaps.
16. **Company Timeline** — three-view timeline (Timeline, Calendar, Gantt) with milestone parent/child grouping, linked and proposed project/initiative milestones, "create from proposed" flow.
17. **Wiki** — block-based wiki pages with parent/child hierarchy, hosted at `/wiki`.

## UI Design System

- **Section headers:** `bg-gray-800` dark bars, white uppercase text
- **Sub-sections:** `bg-gray-700`; blocker sections: `bg-red-800`
- **Table headers:** `bg-gray-50` with `border-gray-300`
- **Borders:** `gray-300` outer, `gray-200` row dividers
- **Item titles:** `font-semibold`
- **Responsible column:** blue initials avatar (`bg-blue-100 text-blue-700`) + full name
- **Priority badges:** colored pills via `priorityColor()` in `lib/utils.ts`
- **Agenda view:** Asana-style collapsible priority groups with dark bar headers
- **Expanded detail panels:** `bg-yellow-50/25` panel background throughout (title bar, description/notes grid, next steps, comments section). Inner content boxes (description, notes, next steps textarea, properties grid, comment textarea, Attach button) use `bg-white` for contrast. Property-table layout — label/value grid (`items-stretch` for aligned borders, `border-gray-200`), Impact as Low/Medium/High select. No duplicate title. Consistent across RAID log, blockers, action items, and agenda view.
- **Reporter column:** Purple initials avatar (`bg-purple-100 text-purple-700`) to distinguish from blue owner avatar
- **Comments section:** `bg-yellow-50/25` background matching panel tint. Comment textarea and Attach button are `bg-white`. Author avatar + name + relative time, delete on hover, file attachment chips.
- **Resolve animation:** Green flash (`bg-green-100`) + fade out + collapse via inline `transition: all 350ms ease-out`
- **Sortable column headers:** Issue Name, Priority, Status in RAID log are clickable toggles showing up/down arrow indicators; active sort highlighted blue. Only one sort active at a time.

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
| `20260306000001_comments.sql` | Comments + comment_attachments tables, RLS, Supabase Storage bucket |
| `20260306000002_raid_subtasks.sql` | Self-referencing `parent_id` on raid_entries for subtask nesting |
| `20260306000003_raid_sort_order.sql` | `sort_order` integer column on raid_entries for drag-and-drop reordering |
| `20260310000001_rbac_and_invitations.sql` | RBAC roles, invitations table, RLS policies, helper functions |
| `20260310000002_update_handle_new_user.sql` | Update new user trigger to read role/vendor_id from invite metadata |
| `20260310000003_remove_duplicate_intake_entries.sql` | Data cleanup for duplicate intake records |
| `20260310000004_agenda_exclude_resolved.sql` | Exclude resolved items from agenda RPCs |
| `20260310000005_agenda_drop_resolved_at_check.sql` | Fix resolved_at filter in agenda RPC |
| `20260310000006_agenda_add_owner_vendor_ids.sql` | Add owner_id + vendor_id to agenda RPC output |
| `20260310000007_agenda_add_status_due_date.sql` | Add status + due_date to agenda RPC output |
| `20260310000008_vendor_agenda_project_id.sql` | Add project_id to vendor agenda RPC output |
| `20260310000009_add_stage_column.sql` | Add `stage` column to action_items and raid_entries |
| `20260310000010_project_documents.sql` | project_documents table for AI-generated section content |
| `20260311000001_user_visible_projects.sql` | `user_visible_project_ids` RPC for role-scoped dashboard |
| `20260311000002_performance_indexes.sql` | Indexes on raid_entries, action_items, blockers, projects, people |
| `20260311000003_fix_fake_projects.sql` | Data cleanup for test/fake project records |
| `20260312000001_raid_notes_column.sql` | Add `notes` column to raid_entries |
| `20260312000002_next_steps_column.sql` | Add `next_steps` column to raid_entries and action_items |
| `20260313000001_milestones.sql` | Milestones table for company timeline |
| `20260313000002_milestones_parent_id.sql` | Self-referencing `parent_id` on milestones for grouping |
| `20260316000001_wiki_pages.sql` | Wiki pages table with parent/child hierarchy and block content |
| `20260318000001_public_issue_form.sql` | Public issue form toggle on projects |
| `20260320000001_reminders.sql` | Reminders table for action/blocker/RAID items |
| `20260324000001_slack_member_id.sql` | Add `slack_member_id` to people for Slack DM links |

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
| [`supabase/migrations/`](https://github.com/sparrowia/tracker/tree/main/supabase/migrations) | Full database schema history (31 migrations) |
| [`.env.local.example`](https://github.com/sparrowia/tracker/blob/main/.env.local.example) | Required environment variables |
| [`PROMPT.md`](https://github.com/sparrowia/tracker/blob/main/PROMPT.md) | Bootstrap prompt for AI assistants |

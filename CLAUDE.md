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
│   │   └── settings/
│   │       ├── page.tsx          # Term corrections for AI extraction
│   │       └── team/page.tsx     # Team management (invites, roles, deactivation)
│   ├── (auth)/login/             # Auth page (shows deactivation error)
│   ├── auth/callback/            # Auth callback (marks invites accepted)
│   └── api/
│       ├── extract/              # DeepSeek extraction endpoint
│       ├── invite/               # POST: send invitation email
│       │   ├── resend/           # POST: resend expired invitation
│       │   ├── cancel/           # POST: cancel invite (deletes auth user + profile + invitation)
│       │   └── accept/           # POST: mark invitation accepted
│       └── users/
│           ├── deactivate/       # POST: deactivate user (admin+)
│           └── reactivate/       # POST: reactivate user (super_admin)
├── components/
│   ├── agenda-view.tsx           # Project meeting agenda — RAID-style layout with resolve, undo, detail panels
│   ├── vendor-agenda-view.tsx    # Vendor meeting agenda — same layout as agenda-view for vendor detail pages
│   ├── project-tabs.tsx          # Project detail tabs (actions, blockers, RAID, agenda, intake) with cross-tab state sync
│   ├── raid-log.tsx              # RAID log with columns, filters, archived view, subtasks, drag-and-drop
│   ├── people-list.tsx            # People page client component — inline editing, status badges, invite, impersonation
│   ├── comment-thread.tsx        # Threaded comments with file attachments
│   ├── owner-picker.tsx          # Person selection dropdown with inline creation
│   ├── vendor-picker.tsx         # Vendor selection dropdown with inline creation
│   ├── role-context.tsx          # React context providing role, profileId, vendorId, userPersonId + impersonation
│   ├── sidebar.tsx               # App navigation sidebar (role-aware)
│   └── topbar.tsx                # Top bar with impersonation banner
└── lib/
    ├── types.ts                  # All TypeScript interfaces
    ├── utils.ts                  # Formatting helpers (priorityColor, formatAge, etc.)
    ├── permissions.ts            # Role-based permission helpers (canCreate, canDelete, canEditItem, etc.)
    ├── pdf.ts                    # Client-side PDF text extraction
    ├── ai/                       # DeepSeek client, context builder, prompts
    ├── parsers/asana.ts          # Deterministic Asana PDF export parser
    └── supabase/
        ├── client.ts             # Browser Supabase client
        ├── server.ts             # Server Supabase client
        ├── admin.ts              # Service-role client (bypasses RLS, for admin operations)
        └── middleware.ts          # Auth middleware (deactivation check + redirect)
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
- **RAID subtasks:** Self-referencing `parent_id` on raid_entries. Subtask disclosure triangle (▶) before the complete circle; children hidden by default, click to expand. Child rows indented with ↳ arrow. Count badge next to parent title.
- **RAID drag-and-drop:** Native HTML5 drag-and-drop for reordering and nesting. Cursor position determines action: top 25% = insert above (blue line), middle 50% = nest as subtask (blue highlight), bottom 25% = insert below (blue line). Sort order persisted via `sort_order` integer column with midpoint calculation.
- **RAID row dividers:** `border-gray-400` for list rows
- **Expanded detail panels:** No duplicate title (shown in row). Property-table grid with `items-stretch` for aligned borders. Impact as Low/Medium/High select (not free text). All detail borders `border-gray-200`.
- **Resolve animation:** Inline `transition: all 350ms ease-out` — green flash + fade + collapse
- **Comments:** Below description in expanded detail panels; auto-author from logged-in user; Cmd+Enter posting; file attachments via Supabase Storage bucket `comment-attachments`
- **VendorPicker:** Inline "+ Add Vendor" creation, same pattern as OwnerPicker
- **Meeting Agenda:** Same RAID-style layout — complete circles with resolve animation, disclosure triangles for subtask groups, bell toggles, collapsible priority groups. Fully editable detail panels: title, owner (OwnerPicker), vendor (VendorPicker), priority, status, due date, RAID type (risk/issue/assumption/decision dropdown), context, ask. Call Notes textarea with AI "Process Notes" button. Vendor agenda also shows linked project names.
- **Cross-tab state sync:** ALL field edits from Meeting Agenda sync to source tabs (Action Items, Blockers, RAID Log) via `registerUpdater` callback pattern on `itemAddersRef`. Resolving uses `registerResolver`. Undo restores both agenda and source tab state. Same ref pattern used for `registerAdder` when creating items from RAID log conversions or AI suggestions.
- **Undo system:** `useUndo` hook in project-tabs provides a toast stack (up to 5). Panels and AgendaView receive `addUndo` prop. Undo callbacks restore DB state and re-add items to local state.
- **Supabase query execution:** Fire-and-forget Supabase queries MUST have `.then(() => {})` appended — the query builder is lazy and won't execute unless the promise is consumed.

## Key Data Models

Defined in `src/lib/types.ts`:

- **Vendor** — external companies (Silk, BenchPrep, etc.)
- **Person** — internal team or vendor contacts
- **Project** — tracked projects with health status
- **ActionItem** — tasks with owner, priority, due date, age
- **Blocker** — blocking issues with impact description
- **AgendaItem** — vendor meeting topics with severity/context/ask
- **RaidEntry** — risks, assumptions, issues, decisions (with owner, reporter, parent_id for subtasks, sort_order for drag-and-drop)
- **Comment** — threaded comments on RAID entries, action items, blockers (polymorphic parent)
- **CommentAttachment** — file attachments on comments (Supabase Storage)
- **SupportTicket** — external support requests
- **Intake** — raw text submissions for AI extraction
- **ProjectAgendaRow** — RPC output for project agenda (includes status, due_date, owner_id, vendor_id)
- **VendorAgendaRow** — RPC output for vendor agenda (includes status, due_date, project_slug, owner_id, vendor_id)
- **VendorAccountabilityRow** — combined view of vendor action items + blockers
- **Profile** — user profile with role, deactivated_at, vendor_id
- **Invitation** — email-based invitations with role, token, expiry

All data tables (ActionItem, RaidEntry, Blocker, AgendaItem, SupportTicket, Project, Vendor, Person) include a `created_by` field linking to the profile that created the record, used for RLS permission checks.

## Roles, Invitations & Access Control (RBAC)

### Roles

Four roles defined as `user_role` enum in Supabase, stored on `profiles.role`:

| Role | Data Access | Create | Edit | Delete | Invite | Admin Pages |
|------|------------|--------|------|--------|--------|-------------|
| **super_admin** | All org data | Yes | All items | Yes | Yes | Yes |
| **admin** | All org data | Yes | All items | Yes | Yes (not super_admin) | Yes |
| **user** | All org data | Yes | Items they created or own | No | No | No |
| **vendor** | Only their vendor's items | No | Status only | No | No | No |

### Database Enforcement (RLS)

All access control is enforced at the Supabase RLS layer via helper functions:
- `user_role()` — returns current user's role from profiles
- `user_vendor_id()` — returns vendor_id for vendor-role users
- `user_is_active()` — checks deactivated_at is null
- `user_can_edit(created_by, owner_id)` — admin+ always true; user if creator or owner

Separate SELECT/INSERT/UPDATE/DELETE policies on every data table. Vendor-scoped reads filter by `vendor_id`. Migration: `20260310000001_rbac_and_invitations.sql`.

### UI Enforcement

- **`src/lib/permissions.ts`**: `canCreate(role)`, `canDelete(role)`, `canEditItem(role, profileId, item, userPersonId)`, `canUpdateStatus(role)`, `canInvite(role)`
- **`src/components/role-context.tsx`**: React context (`useRole()` hook) provides role, profileId, orgId, vendorId, userPersonId, impersonation, stopImpersonation to all client components
- **`src/app/(app)/layout.tsx`**: Wraps app in `<RoleProvider>`
- **`src/components/sidebar.tsx`**: Hides admin pages from users/vendors; hides Intake/Ask from vendors. Uses `useRole()` context (not props) so impersonation is reflected in sidebar visibility and project filtering.
- Components (raid-log, agenda-view, comment-thread, pickers) check permissions to show/hide create, delete, edit controls

### Invitation Flow

1. Admin sends invite from Settings → Team (`POST /api/invite`)
2. Supabase sends email via `auth.admin.inviteUserByEmail()` with `{ org_id, role, vendor_id }` in metadata
3. User clicks link → sets password → `auth/callback` marks invitation `accepted_at`
4. `handle_new_user` trigger reads metadata to set org_id, role, vendor_id on new profile

### Deactivation

- Admin deactivates user → `POST /api/users/deactivate` sets `profiles.deactivated_at` and bans auth user
- Middleware checks `deactivated_at` on full page loads (skips RSC fetch requests for performance) → signs out and redirects to `/login?error=account_deactivated`
- Super_admin can reactivate via `POST /api/users/reactivate`

### Team Management UI

`/settings/team` (admin/super_admin only):
- Active members table with role badges, deactivate buttons
- Pending invitations table with resend/cancel
- Deactivated users (collapsible) with reactivate button (super_admin only)
- Invite form: email, role dropdown, vendor picker (for vendor role)

### Impersonation (super_admin only)

Super admins can impersonate any person from the People page (`/settings/people`). Stored in `sessionStorage` under key `"impersonation"`, picked up by `RoleProvider` via a custom `"impersonation-change"` event. While impersonating:
- Role context overrides `role`, `vendorId`, and `userPersonId` to match the impersonated person
- Purple banner in topbar shows "Viewing as [Name] (role)" with a Stop button
- All permission checks (sidebar, create/edit/delete buttons) reflect the impersonated role
- RLS still uses the real auth user, so all data remains visible — impersonation is UI-level only

### People Page (`/settings/people`)

Client component `people-list.tsx` with two tabs: **Internal Team** and **Vendors**.

**Internal Team tab:**
- Alphabetically sorted by first name
- Click-to-expand inline editing for all person fields (name, title, email, phone, vendor, internal, notes)
- Checking "Internal" clears vendor assignment and hides vendor field
- Contact status badges: **Joined** (has profile_id), **Invited** (pending invitation by email match), **Added** (manually created)
- Invite button on "Added" contacts with email — calls `POST /api/invite` with role inferred from vendor_id
- "+ Add Person" button in dark header
- Delete via trash icon in full-width action bar (matching RAID log pattern)
- Impersonate button for super_admin

**Vendors tab:**
- Contacts grouped by vendor name using disclosure triangles (▶) matching RAID log parent/child pattern
- Vendor groups sorted alphabetically, "Unassigned" at bottom
- Click arrow to expand/collapse; contacts indented underneath
- Same click-to-expand inline editing as Internal Team tab
- "+ Add Contact" button in dark header

## Inline Add Pattern

Consistent inline add form across RAID log, Action Items, Blockers, and People:
- "+ Add [Type]" button in the dark header bar
- Blue-50 background form appears below header with title input, priority selector, Add/Cancel buttons
- Enter to submit, Escape to cancel
- New item inserted into DB with `created_by: profileId` and auto-added to local state

## RAID Log — Decisions

Decisions have a distinct UX from other RAID types (risks, assumptions, issues):
- **No complete circle** — decisions are not "resolved" like other items
- **No parent-child nesting** — no subtask toggle, no drag-and-drop reordering
- **Simplified detail panel** — only Status, Owner, Decision Date, Description, Comments
- **Two statuses only** — Pending and Final (Final maps to `complete` in DB, displayed as "Final")
- **Inline-editable title** — clicking the title in the row allows direct editing

## AI Contact Extraction

The `/api/extract` route includes a `contacts` array in the AI extraction schema. When intake text mentions people with titles, emails, or phone numbers, the AI extracts them. On confirm in the review page, the app:
1. Fuzzy-matches extracted contacts to existing `people` records (exact, substring, first/last name, Levenshtein)
2. Updates any missing title/email/phone fields on matched records (never overwrites existing data)
3. No user review needed — happens automatically during `handleConfirm`

Stored in `extractedContactsRef` (a ref, not part of `extracted` state which is typed as `Record<EntityCategory, ExtractedItem[]>`).

## Performance Optimizations

### Database Indexes
Migration `20260311000002_performance_indexes.sql` adds indexes on:
- `raid_entries`: reporter_id, owner_id, status, resolved_at
- `action_items`: due_date, priority+status (composite)
- `blockers`: project_id, owner_id, resolved_at
- `projects`: initiative_id
- `people`: profile_id

### Vendor Item Counts RPC
`vendor_item_counts()` — single SQL query with GROUP BY joins that returns action/blocker/people counts per vendor. Replaces full-table scans with client-side aggregation on dashboard and vendors page.

### Slim SELECT Joins
Dashboard queries use `select("*, owner:people(id, full_name), ...")` instead of `select("*, owner:people(*)")` to reduce payload size. Same for comment thread author joins.

### Middleware Optimization
Deactivation DB check skipped on RSC fetch requests (`rsc` or `next-router-state-tree` headers). Full check still runs on initial page loads and hard navigations.

### Layout Parallelization
`layout.tsx` runs profile + person queries in parallel with `Promise.all` instead of sequential awaits.

### Client-Side Pages for Fast Navigation
Initiative detail (`/initiatives/[slug]`) is a client component — fetches directly from browser Supabase client, avoiding server round-trip overhead (middleware + layout re-render). Shows inline loading skeleton while data loads.

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

# CLAUDE.md - Edcetera PM Tracker

## Project Overview

Edcetera project management / knowledge management tool. Next.js 16 (App Router) + Supabase + Tailwind CSS 4.

- **Repo:** github.com/sparrowia/tracker
- **Vercel Project:** edcet-tracker
- **Production URL:** edcet-tracker.vercel.app
- **Deployment:** Vercel auto-deploys from `main`. Always commit + push to main after changes — Matt tests on deployed Vercel, not localhost.

## Multi-Project Environment

Matt has multiple projects across different directories and Vercel accounts. **Always verify you are working in the correct project before running commands.**

- **This project:** `/Users/matthewlobel/projects/edcetera-pm` → Vercel: `edcet-tracker`
- **Edcetera support portal:** `/Users/matthewlobel/Repositories/edcet` → Vercel: `edcet` (under `avalon-adventures` team)
- **Project management docs:** `/Users/matthewlobel/Repositories/edcet/project-management` → markdown files, no deployment
- **Other projects exist** (LivingTale, Avalon Adventures) — never assume. Always check `pwd` and `.vercel/project.json` before deploying.

**Vercel CLI note:** The CLI is authenticated to the `avalon-adventures` team (`matt-7913`), which does NOT have access to `edcet-tracker`. That project lives under a different Vercel scope. Do not use `npx vercel` for this project — rely on git push auto-deploy instead.

## Tech Stack

- Next.js 16 (App Router, `src/app/`)
- Supabase (auth, database, RPC functions like `generate_vendor_agenda`, views like `blocker_ages`/`action_item_ages`/`vendor_accountability`)
- Tailwind CSS 4
- TypeScript
- Tesseract.js (client-side OCR for image intake)
- pdfjs-dist (client-side PDF text extraction)
- DeepSeek API (extraction/synthesis via `/api/extract` route)
- Deterministic Asana parser (`lib/parsers/asana.ts`) — bypasses AI for Asana PDF exports
- TipTap (MIT) — rich text editor for wiki/docs pages
- Slack Bot (`Ed` the capybara 🐾) — notifications + `/ed` slash command

## Key Directories

```
src/
├── app/
│   ├── (app)/                    # Authenticated routes
│   │   ├── dashboard/            # Role-scoped dashboard (client component)
│   │   ├── agendas/              # Agenda index (vendor list)
│   │   │   └── [vendorSlug]/     # Vendor-specific agenda (uses AgendaView component)
│   │   ├── blockers/             # Active blockers list
│   │   ├── vendors/              # Vendor cards + detail pages
│   │   │   └── [id]/             # Vendor detail (contacts, accountability)
│   │   ├── projects/             # Project list + detail pages
│   │   │   └── [slug]/           # Project detail (blockers, actions, RAID log)
│   │   ├── timeline/             # Company timeline with milestones (3 views: timeline, calendar, gantt)
│   │   ├── people/               # Internal team + vendor contacts
│   │   ├── intake/               # Raw text/image intake with OCR
│   │   │   └── [id]/review/      # Review extracted items
│   │   ├── reports/              # Steering committee reports with presentation mode
│   │   ├── docs/                 # Documentation wiki (TipTap editor)
│   │   └── settings/
│   │       ├── page.tsx          # Term corrections for AI extraction
│   │       └── team/page.tsx     # Team management (invites, roles, deactivation)
│   ├── (auth)/login/             # Auth page (shows deactivation error)
│   ├── auth/callback/            # Auth callback (marks invites accepted)
│   ├── issues/[slug]/            # Public issue submission form (no auth required)
│   └── api/
│       ├── extract/              # DeepSeek extraction endpoint
│       ├── invite/               # POST: send invitation email
│       │   ├── resend/           # POST: resend expired invitation
│       │   ├── cancel/           # POST: cancel invite (deletes auth user + profile + invitation)
│       │   └── accept/           # POST: mark invitation accepted
│       ├── issues/
│       │   ├── submit/           # POST: public issue submission (service-role, no auth)
│       │   ├── salesforce/       # POST: Salesforce case ingest (X-API-Key auth)
│       │   └── project/          # GET: project info for public form
│       ├── notify/
│       │   └── digest/           # GET: Vercel cron — sends batched email notifications (every 2h)
│       ├── slack/
│       │   └── command/          # POST: /ed slash command handler
│       └── users/
│           ├── deactivate/       # POST: deactivate user (admin+)
│           └── reactivate/       # POST: reactivate user (super_admin)
├── components/
│   ├── agenda-view.tsx           # Project meeting agenda — RAID-style layout with resolve, undo, detail panels
│   ├── vendor-agenda-view.tsx    # Vendor meeting agenda — same layout as agenda-view for vendor detail pages
│   ├── project-tabs.tsx          # Project detail tabs (actions, blockers, RAID, agenda, intake, docs) with cross-tab state sync
│   ├── project-header.tsx        # Project header with edit form, public issue form toggle, health badge
│   ├── raid-log.tsx              # RAID log with columns, filters, archived view, subtasks, drag-and-drop, multi-select
│   ├── wiki-editor.tsx           # TipTap rich text editor for documentation wiki
│   ├── reminder-button.tsx       # Alarm clock reminder popover for action/blocker/RAID items
│   ├── people-list.tsx            # People page client component — inline editing, status badges, invite, impersonation
│   ├── comment-thread.tsx        # Threaded comments with file attachments
│   ├── owner-picker.tsx          # Person selection dropdown with inline creation
│   ├── vendor-picker.tsx         # Vendor selection dropdown with inline creation
│   ├── comment-editor.tsx         # TipTap-based comment input with @mention autocomplete
│   ├── steering-committee-section.tsx  # Shared steering committee UI for projects and initiatives
│   ├── steering-report.tsx       # Reports page with card grid layout and phase tabs
│   ├── steering-presentation.tsx # Full-screen presentation mode for steering reports
│   ├── vendor-contacts.tsx       # Vendor detail page contacts with invite/edit/delete
│   ├── role-context.tsx          # React context providing role, profileId, vendorId, userPersonId + impersonation
│   ├── sidebar.tsx               # App navigation sidebar (role-aware)
│   └── topbar.tsx                # Top bar with impersonation banner
└── lib/
    ├── types.ts                  # All TypeScript interfaces
    ├── utils.ts                  # Formatting helpers (priorityColor, formatAge, etc.)
    ├── permissions.ts            # Role-based permission helpers (canCreate, canDelete, canEditItem, canEditWikiPage, etc.)
    ├── slack.ts                  # Slack Bot notification utility (sendSlackMessage, notifyNewIssue, notifyNewBlocker)
    ├── email.ts                  # Gmail SMTP email utility (nodemailer) for notification digests
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
- **RAID log filters:** Priority, status, owner dropdowns + New/Updated checkboxes; active filters highlight blue; header shows filtered/total count. New/Updated filters snapshot matching item IDs so items don't vanish when expanded (marked as read).
- **RAID archived view:** "Archived (N)" text link below type tabs; flat list sorted by resolved_at desc; type label, priority, owner, resolved date columns; reopen button
- **RAID subtasks:** Self-referencing `parent_id` on raid_entries. Subtask disclosure triangle (▶) before the complete circle; children hidden by default, click to expand. Child rows indented with ↳ arrow. Count badge next to parent title.
- **RAID drag-and-drop:** Native HTML5 drag-and-drop for reordering and nesting. Cursor position determines action: top 25% = insert above (blue line), middle 50% = nest as subtask (blue highlight), bottom 25% = insert below (blue line). Sort order persisted via `sort_order` integer column with midpoint calculation. Same drag-and-drop also ported to Action Items panel.
- **RAID row dividers:** `border-gray-400` for list rows
- **Expanded detail panels:** No duplicate title (shown in row). Property-table grid with `items-stretch` for aligned borders. Impact as Low/Medium/High select (not free text). All detail borders `border-gray-200`.
- **Resolve animation:** Inline `transition: all 350ms ease-out` — green flash + fade + collapse
- **Comments:** Below description in expanded detail panels; auto-author from logged-in user; Cmd+Enter posting; file attachments via Supabase Storage bucket `comment-attachments` (public bucket). Posting a comment bumps parent item's `updated_at` to trigger unread indicators for other users.
- **VendorPicker:** Inline "+ Add Vendor" creation, same pattern as OwnerPicker
- **Meeting Agenda:** Same RAID-style layout — complete circles with resolve animation, disclosure triangles for subtask groups, bell toggles, collapsible priority groups. Fully editable detail panels: title, owner (OwnerPicker), vendor (VendorPicker), priority, status, due date, RAID type (risk/issue/assumption/decision dropdown), context, ask. Call Notes textarea with AI "Process Notes" button. Vendor agenda also shows linked project names.
- **Cross-tab state sync:** ALL field edits from Meeting Agenda sync to source tabs (Action Items, Blockers, RAID Log) via `registerUpdater` callback pattern on `itemAddersRef`. Resolving uses `registerResolver`. Undo restores both agenda and source tab state. Same ref pattern used for `registerAdder` when creating items from RAID log conversions or AI suggestions.
- **Undo system:** `useUndo` hook in project-tabs provides a toast stack (up to 5). Panels and AgendaView receive `addUndo` prop. Undo callbacks restore DB state and re-add items to local state.
- **Supabase query execution:** Fire-and-forget Supabase queries MUST have `.then(() => {})` appended — the query builder is lazy and won't execute unless the promise is consumed.

## Key Data Models

Defined in `src/lib/types.ts`:

- **Vendor** — external companies (Silk, BenchPrep, etc.)
- **Person** — internal team or vendor contacts (includes `slack_member_id` for Slack DM links)
- **Project** — tracked projects with health status
- **ActionItem** — tasks with owner, priority, due date, age, parent_id for subtask nesting
- **Blocker** — blocking issues with impact description
- **AgendaItem** — vendor meeting topics with severity/context/ask
- **RaidEntry** — risks, assumptions, issues, decisions (with owner, reporter, parent_id for subtasks, sort_order for drag-and-drop, due_date, sf_case_id/sf_case_number/sf_case_url for Salesforce integration)
- **ProjectDepartmentStatus** — department status cards for steering committee (department, rep_person_id, status green/yellow/red, roadblocks, decisions)
- **Comment** — threaded comments on RAID entries, action items, blockers (polymorphic parent)
- **CommentAttachment** — file attachments on comments (Supabase Storage, public bucket). Filenames sanitized (spaces/special chars → underscores) for storage path, original name kept for display.
- **SupportTicket** — external support requests
- **Intake** — raw text submissions for AI extraction
- **ProjectAgendaRow** — RPC output for project agenda (includes status, due_date, owner_id, vendor_id)
- **VendorAgendaRow** — RPC output for vendor agenda (includes status, due_date, project_slug, owner_id, vendor_id)
- **VendorAccountabilityRow** — combined view of vendor action items + blockers
- **Profile** — user profile with role, deactivated_at, vendor_id
- **Invitation** — email-based invitations with role, token, expiry
- **Milestone** — timeline milestones with parent/child grouping, linked or proposed projects/initiatives

All data tables (ActionItem, RaidEntry, Blocker, AgendaItem, SupportTicket, Project, Vendor, Person) include a `created_by` field linking to the profile that created the record, used for RLS permission checks.

## Roles, Invitations & Access Control (RBAC)

### Roles

Four roles defined as `user_role` enum in Supabase, stored on `profiles.role`:

| Role | Data Access | Create | Edit | Delete | Invite | Admin Pages |
|------|------------|--------|------|--------|--------|-------------|
| **super_admin** | All org data | Yes | All items | Yes | Yes | Yes |
| **admin** | All org data | Yes | All items | Yes | Yes (not super_admin) | Yes |
| **user** | All org data | Yes | Items they created/own + items in projects they own, are QA lead on, or whose initiative they own | Items in projects they own/QA-lead/initiative-own | No | No |
| **vendor** | Only their vendor's items | No | Status only | No | No | No |

### Database Enforcement (RLS)

All access control is enforced at the Supabase RLS layer via helper functions:
- `user_role()` — returns current user's role from profiles
- `user_vendor_id()` — returns vendor_id for vendor-role users
- `user_is_active()` — checks deactivated_at is null
- `user_can_edit(created_by, owner_id)` — admin+ always true; user if creator or owner
- `user_is_project_admin(project_id)` — true when auth user is the project's `project_owner_id`, `lead_qa_id`, listed in `initiative_owners` for the project's initiative, or set as the legacy `initiatives.owner_id`. Grants UPDATE + DELETE on `action_items`, `blockers`, `raid_entries`, and `agenda_items` linked to that project.

Separate SELECT/INSERT/UPDATE/DELETE policies on every data table. Vendor-scoped reads filter by `vendor_id`. Migrations: `20260310000001_rbac_and_invitations.sql` (initial), `20260507000001_project_owner_admin.sql` + `20260507000003_qa_lead_is_project_admin.sql` (project-admin scope).

**Silent-rollback caveat**: an RLS-denied UPDATE returns `200 OK` with `data: []` and `error: null` — it is NOT thrown. The save handlers across `project-tabs`, `raid-log`, `agenda-view`, `vendor-agenda-view`, `vendor-open-items` mutate local state optimistically, so a denied write looks like it succeeded until the next refetch reverts it. If you add a new save handler, chain `.select().single()` so RLS denials surface as errors.

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

### People Page (`/settings/people`) — also serves as Team Management

Client component `people-list.tsx` with two tabs: **Internal Team** and **Vendors**. Replaces the separate Team Management page.

**Internal Team tab:**
- Alphabetically sorted by first name
- Click-to-expand inline editing for all person fields (name, title, email, phone, Slack ID, vendor, internal, notes)
- Checking "Internal" clears vendor assignment and hides vendor field
- Contact status badges: **Joined** (has profile_id), **Invited** (pending invitation by email match), **Added** (manually created)
- Invite with role/vendor picker — click "Invite" → select role (User/Admin/Vendor) + vendor → "Send"
- Role editing dropdown for joined members (Admin/User/Vendor) — in expanded detail panel
- Deactivate button for joined members (admin/super_admin, not for super_admin accounts)
- "+ Add Person" button in dark header
- Delete via trash icon in full-width action bar (matching RAID log pattern)
- Impersonate button for super_admin

**Vendors tab:**
- Contacts grouped by vendor name using disclosure triangles (▶) matching RAID log parent/child pattern
- Vendor groups sorted alphabetically, "Unassigned" at bottom
- Click arrow to expand/collapse; contacts indented underneath
- Same click-to-expand inline editing as Internal Team tab
- "+ Add Contact" button in dark header

## Dashboard

Client component (`/dashboard`) with role-scoped data:
- **Overdue** (red `bg-red-800` header) — action items past due date
- **Due This Week** — action items due in next 7 days
- **Contact column** — replaces Status column in Overdue and Due This Week tables with:
  - Gmail compose icon (envelope) — opens `mail.google.com/mail/?view=cm` with pre-filled To, Subject (`RE: <item title>`), and body (link back to item in Tracker)
  - Slack DM icon (chat bubble) — links to `edcetera.slack.com/team/MEMBER_ID` to open the person's Slack profile (requires `slack_member_id` on the person record)
  - Icons show gray, turn blue (email) or purple (Slack) on hover
- **Active Blockers** — with age severity coloring from `blocker_ages` view
- **Risks & Issues** (left column) / **Decisions Needed** (right column) — 2-column grid from `raid_entries`
- **Initiatives** — HR divider with "Initiatives" label, then 2-column grid of initiative tables showing child projects with health/action/blocker counts
- Initiative health is **computed from worst child project health** (not the manually-set DB field)
- Scoped via `user_visible_project_ids` RPC for regular users; admins see everything
- Empty sections are hidden

## Initiative Detail

Client component (`/initiatives/[slug]`) with inline editing:
- **Click-to-edit name** — click title to edit inline
- **Properties grid** — Health (dropdown), Owners (multiple, blue pills with OwnerPicker), Target date (date picker), Slug (read-only)
- **Multiple owners** — `initiative_owners` junction table; owners shown as blue pills with X to remove, OwnerPicker to add
- **Editable Description and Notes** — click to open textarea
- **Steering Committee Section** — collapsible section with Executive Sponsor, Steering Phase, Priority, Completion Dates, Product Type, Asana Link, and Department Status cards (shared component with projects)
- Editing gated to admins (`super_admin`/`admin`) and any initiative owner (checked via junction table)
- **Project visibility** — non-admin users only see projects they have access to (via `user_visible_project_ids` RPC)
- `+ Add Project` button also hidden for non-editors
- **Initiative dropdown** on project header allows reassigning projects between initiatives (triggers sidebar refresh)

## Company Timeline

Client component (`/timeline`) with three view tabs: **Timeline**, **Calendar**, **Gantt**.

### Database
`milestones` table with `parent_id` self-referencing FK (CASCADE delete) for parent/child grouping. Migrations: `20260313000001_milestones.sql`, `20260313000002_milestones_parent_id.sql`. RLS: org-scoped, hidden from vendors.

### Milestone Types
- `MilestoneType`: `project`, `initiative`, `proposed_project`, `proposed_initiative`
- `MilestoneStatus`: `pending`, `in_progress`, `complete`
- Helper functions in utils.ts: `milestoneTypeLabel`, `milestoneTypeColor`, `milestoneStatusLabel`, `milestoneStatusColor`

### Visual Patterns
- **Linked milestones:** Solid dot, `bg-yellow-50/60` background, health badge from linked entity
- **Proposed milestones:** Dashed dot border, no status badge, clickable type pill opens AddProjectButton/AddInitiativeButton modal pre-filled with milestone data
- **Complete milestones:** `opacity-50 hover:opacity-70`, green dot (`bg-green-500`)
- **Parent/child:** Disclosure triangles (▶) for expand/collapse, child rows indented with ↳ arrow
- **Helper text:** "Click on a proposed project/initiative pill to create it" at top of page

### Three Views
- **Timeline:** Vertical list grouped by quarter → month, with inline detail panel on click
- **Calendar:** Monthly grid with month navigation, milestone pills on date cells, "+N more" overflow, today highlight
- **Gantt:** Two-panel layout (260px label column + scrollable chart), MONTH_WIDTH=140px, parent span bars from earliest to latest child date, diamond markers, today red line

### "Create from Proposed" Flow
1. User clicks proposed type pill on a milestone
2. Opens AddProjectButton or AddInitiativeButton modal pre-filled with title, description, target_date
3. On save, `onCreated(id)` callback updates milestone: sets `milestone_type` to `project`/`initiative`, sets `project_id`/`initiative_id`
4. Both AddProjectButton and AddInitiativeButton accept `defaultValues`, `onCreated`, `openExternal` props

### Sidebar
Timeline link uses `CalendarDays` icon from lucide-react, placed between Ask and Initiatives group, hidden from vendor role.

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

## RAID Log — Due Date

RAID entries have a `due_date` column (migration: `20260327000002_raid_due_date.sql`):
- Editable in detail panel via InlineDate picker
- Available as a column toggle and in bulk editor toolbar
- Column display: past due = red italic MM/DD/YY, today = red "today", tomorrow = "tomorrow", future = short date
- Stage field removed from RAID detail panel and column toggles
- Parent dropdown removed from issue detail panel (nesting is visually obvious via parent-child display)

## RAID Log — Changelog

"View changelog" link in RAID detail panel opens a modal showing activity history:
- Uses the existing `activity_log` table
- All RAID field edits and comments are logged with person, date/time, field name, old/new values
- Human-readable labels for owner, vendor, status, priority fields (resolves IDs to names)
- **Created entry**: AFTER INSERT triggers on `action_items`, `raid_entries`, and `blockers` write a `created` row to `activity_log` using the entity's `created_by` + `created_at`, so the changelog always shows who opened the item. Backfilled for existing rows in migration `20260430000001_log_entity_created.sql`. The 3 changelog panels (`ActionChangelogPanel` in project-tabs, `ChangelogPanel` in raid-log, `VendorChangelogToggle` in vendor-open-items) render `action === 'created'` as "&lt;Who&gt; — Created". Rows with NULL `created_by` show as "System".

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
Dashboard queries use `select("*, owner:people(id, full_name, email, slack_member_id), ...")` instead of `select("*, owner:people(*)")` to reduce payload size. Same for comment thread author joins.

### Middleware Optimization
Deactivation DB check skipped on RSC fetch requests (`rsc` or `next-router-state-tree` headers). Full check still runs on initial page loads and hard navigations.

### Layout Parallelization
`layout.tsx` runs profile + person queries in parallel with `Promise.all` instead of sequential awaits.

### Client-Side Pages for Fast Navigation
Initiative detail (`/initiatives/[slug]`) and dashboard (`/dashboard`) are client components — fetch directly from browser Supabase client, avoiding server round-trip overhead (middleware + layout re-render). Show inline loading skeletons while data loads.

## Documentation Wiki

Client component (`/docs`) with TipTap (MIT) rich text editor:
- `wiki_pages` table with parent/child hierarchy, RLS (hidden from vendors)
- Two-panel layout: page tree on left, editor on right
- Dynamic import with `ssr: false` to avoid React hooks errors from TipTap
- Sidebar links use `prefetch={false}` to prevent TipTap bundle loading on other pages
- Migration: `20260316000001_wiki_pages.sql`

## Project Documentation (Docs Tab)

Each project has a Docs tab with:
- **Files** — upload/download/delete files stored in Supabase Storage (`project-files` bucket)
- **Notes** — free-form textarea that autosaves to `projects.notes`
- Both always visible in the index, even without generated AI documentation
- AI-generated sections (Project Overview, Stakeholders, Status Summary, etc.) appear below

## Public Issue Form

Public-facing issue submission form per project at `/issues/[slug]`:
- No auth required (middleware excludes `/issues` and `/api/issues` paths)
- Toggle on/off per project via `public_issue_form` boolean in project header (admin only)
- Fields: Name, Issue Name, Description, Issue Type (13 options), URL, OS, Browser, up to 5 attachments
- "Submit & New" keeps reporter name pre-filled
- Creates RAID entry (type: issue) via service-role client
- Slack notification when submitted (project-channel mapped)
- Migration: `20260318000001_public_issue_form.sql`

## Reminders

Alarm clock button on Action Item, Blocker, and RAID entry detail panels:
- Popover with preset time options (1h, 4h, tomorrow 9am, 3 days, 1 week) + custom datetime
- `reminders` table with profile_id, entity_type, entity_id, remind_at, dismissed
- Dashboard "REMINDERS" section (indigo header) below Overdue — shows due reminders with Snooze/Dismiss
- Migration: `20260320000001_reminders.sql`

## Slack Integration

Bot name: **Ed** (capybara 🐾, company mascot). Slack App ID: `A0AMR4A6Y2H`.

### Notifications (Level 1)
- New public issue submitted → posts to project-mapped Slack channel
- Project-to-channel mapping in `src/app/api/issues/submit/route.ts`
- Currently mapped: `silk-uat` → `#uat-unified-ce-platform`
- Utility: `src/lib/slack.ts` with `sendSlackMessage`, `notifyNewIssue`, `notifyNewBlocker`

### Slash Command (`/ed`)
- `/ed` or `/ed hello` — Greeting from Ed the capybara
- `/ed status` — Live project stats (scoped to project when run from a mapped channel)
- `/ed motivate` — Random encouraging message (20 variations)
- `/ed help` — Command menu
- Channel-to-project mapping for scoped status: `uat-unified-ce-platform` → Unified System
- Handler: `src/app/api/slack/command/route.ts`

### Environment Variables
- `SLACK_BOT_TOKEN` — Bot User OAuth Token (xoxb-...)
- `SLACK_DEFAULT_CHANNEL` — Fallback channel (currently `#uat-unified-ce-platform`)

## Unread/Updated Indicators

Action items and RAID entries show indicators before the title:
- **Blue `NEW` pill** — item has never been viewed by the user
- **Red `❗` emoji** — item was updated since the user last viewed it (includes comments bumping `updated_at`)
- `item_reads` table tracks `(profile_id, entity_type, entity_id, read_at)`
- Expanding an item marks it as read (fire-and-forget upsert)
- **Own changes don't trigger indicators** — after editing a field or posting a comment, the user's `read_at` is set to the DB-returned `updated_at`, preventing their own changes from showing the red indicator. This correctly handles the `BEFORE UPDATE` trigger that always sets `updated_at = now()` on the server.
- One batch query per panel on mount (no N+1)
- Migration: `20260326000001_item_reads.sql`

## Action Item Subtasks

Action items support parent/child nesting (mirrors RAID log pattern):
- `parent_id` and `sort_order` columns on `action_items`
- Disclosure triangles (▶) to expand/collapse children, ↳ arrow on child rows
- Child count badges on parent items
- HTML5 drag-and-drop for reordering and nesting (ported from RAID log): top 25% = insert above, middle 50% = nest as subtask, bottom 25% = insert below. Cycle prevention for nesting.
- Row layout order: checkbox → child arrow → disclosure triangle → complete circle → bell → NEW/indicators → title. Click row to toggle detail (no expand chevron). Auto-select children when selecting parent.
- Intake extraction uses native `parent_id` instead of writing "Parent:"/"Related to:" text in notes
- Type conversion dropdown: action items can be converted to Risk/Issue/Assumption/Decision/Blocker (and vice versa from RAID log)
- Migration: `20260324000002_action_item_subtasks.sql`

## @Mentions & Comment Notifications

Comments use TipTap editor with `@tiptap/extension-mention`:
- Type `@` to see a dropdown of people at cursor position (tippy.js)
- Mentions render as blue bold atomic nodes (can't partially edit)
- Stored as `@[Name](person_id)` format in comment body
- Rendered as styled blue text when displaying comments
- Dynamic import with `ssr: false` (same pattern as wiki editor)

### Email Notification Digest
- `comment_notifications` table queues notifications for: @mentions, item owner comments, and assignment changes
- Each notification block has its own "Open in Tracker" deep link to the specific project page (`/projects/[slug]`) using `entity_id` and `project_slug` columns on `comment_notifications`
- Vercel Cron (`/api/notify/digest`) runs every 2 hours, batches notifications per recipient
- Sent via Gmail SMTP (nodemailer) from `support@edcet.com`
- Green border for assignments, blue for @mentions, purple for owner comments
- Env vars: `SMTP_USER`, `SMTP_PASS`, `CRON_SECRET`
- Middleware excludes `/api/notify` from auth redirect
- Migrations: `20260326000004_comment_notifications.sql`, `20260326000005_assignment_notifications.sql`, `20260327000001_notification_deep_links.sql`

## Salesforce Case Ingest

`POST /api/issues/salesforce` — accepts Salesforce case payload, creates RAID entry (type: issue):
- Auth via `X-API-Key` header (`SALESFORCE_API_KEY` env var)
- Duplicate detection via `sf_case_id` unique index (returns 409)
- Maps SF priority to tracker priority
- Stores `sf_case_id`, `sf_case_number`, `sf_case_url` on raid_entries
- Returns `{ success, issue: { id, url, number } }` for Salesforce Flow callback
- Migration: `20260326000002_salesforce_case_fields.sql`

## Vendor Contacts Management

`VendorContacts` client component on vendor detail page (`/settings/vendors/[id]`):
- Status badges: **Joined** (green), **Invited** (blue), **Added** (gray)
- "Invite to Tracker" button with vendor role — sends invitation via `/api/invite`
- Click-to-expand inline editing (name, title, email, phone, Slack ID)
- Delete cascade: cancels pending invitation or deactivates joined user before removing contact
- "+ Add Contact" button in dark header

## Vendor RLS — Personal Items

Vendor-role users see items where:
- `vendor_id` matches their vendor (original behavior), OR
- `owner_id` matches their person record (added)
- `user_person_id()` helper function maps `auth.uid()` to `people.id`
- Migration: `20260326000003_vendor_see_personal_items.sql`

## Password Reset

Login page includes "Forgot password?" link:
- Sends Supabase reset email via `resetPasswordForEmail`
- Redirects directly to `/set-password` (not through `/auth/callback` — avoids PKCE storage issues)
- Set-password page parses hash tokens on mount to establish session

## Multi-Select & Bulk Operations

Action items, blockers, and RAID entries support multi-select:
- Click left edge of row to select (blue checkmark appears)
- Shift+click for range selection
- Selecting a RAID parent auto-selects children
- Floating dark toolbar appears at bottom with bulk operations:
  - Priority, Status, Owner, Due Date dropdowns (bulk update)
  - RAID log: "Nest under..." dropdown + "Group" button
  - Delete button (confirmation dialog)
  - Clear selection

## Intake Review (Extraction)

Single-card view with category tabs:
- Keyboard shortcuts: A=accept, X=reject, E=edit, Left/Right=navigate
- Accept All per tab, auto-advance with visual flash (green/grey)
- Inline-editable: type reassignment, priority, owner, due date, click-to-edit title
- Related items: text-based matching first (word overlap + substring), AI only for unmatched
- Link actions: Update / Replace / Child ↓ / Parent ↑
- Manual search: "+ Link to existing item" searches action_items/blockers/raid_entries (white background input)
- Manual search also includes accepted items from the current extraction, labeled "from this extraction" (no link action buttons since not yet in DB)
- Tab badge shows reviewed/total count (both accepted and rejected items count as reviewed)
- Completed/closed items excluded from matches
- Fathom transcripts pre-processed: strip URLs/timestamps, extract ACTION ITEMs deterministically
- Current year injected into prompt + post-processing fixes wrong-year dates
- Discard Extraction button in header

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

**CRITICAL: Bulk UPDATE in migrations** — `action_items`, `blockers`, and `raid_entries` have a `BEFORE UPDATE` trigger (`set_updated_at`) that sets `updated_at = now()` on every touched row. Bulk UPDATE statements in migrations (e.g., backfills) will poison `updated_at` on every row, causing false unread indicators for all users. To avoid this, disable the trigger around bulk updates:
```sql
ALTER TABLE action_items DISABLE TRIGGER set_updated_at;
UPDATE action_items SET new_column = old_column;
ALTER TABLE action_items ENABLE TRIGGER set_updated_at;
```

## Deployment

- Commits to `main` auto-deploy to production via Vercel
- For experimental UI changes, use a branch, then merge to main when approved
- Do NOT use `npx vercel` — CLI is scoped to wrong team
- Always `npm run build` before pushing to catch errors

## Vendor Detail Page

The vendor detail page (`/settings/vendors/[id]`) is the hub for vendor meeting prep:

- **Vendor Health Report** — super_admin only. Overall A-F grade + 8 metric cards (Avg Ticket Age, Time to First Action, Avg Resolution Time, QA Bounce Rate, Missing ETAs, Time to Set ETA, Overdue Rate, Critical/High Open). Computed from activity_log + item data.
- **Contacts** — add/edit/delete vendor contacts with invite/resend
- **Project tabs** — 🔥 (critical+high across all projects), All, then one tab per project. Items show action items, blockers, and RAID issues assigned to the vendor.
- **Filters** — RAID-log-style filter bar (Type, Priority, Status, Owner) + search input
- **Expandable detail panels** — full RAID-style layout with description, meeting notes, next steps, properties grid, vendor reassignment, changelog, and comments
- **Vendor reassignment** — VendorPicker in detail panel; item leaves the view immediately when reassigned
- **"+ Add Item" button** — inline with project tabs, creates action items/blockers/issues directly on vendor without project association
- **Project column** — shows source project (clickable link) or dash for unassociated items
- **Changelog** — "View changelog" in detail panels for all entity types
- **"My Company" sidebar link** — vendors see their own vendor page via Building icon in sidebar
- **Last Updated column** — replaces Age, shows relative time (3h ago, yesterday, 2w ago)
- **Covered column (Fire tab only)** — rightmost checkbox on the 🔥 tab, used to mark items as discussed during a meeting. Checked rows grey out (`opacity-40`) while collapsed; expanded detail stays full opacity. State is per-user/per-device via `localStorage` (`vendor-covered-${vendorId}` → `{ date, ids[] }`) and resets daily — if the stored date isn't today, the entry is dropped on load. Pure UX state, no DB schema. Implemented in `src/components/vendor-open-items.tsx`.

## Two-Flag Meeting Toggle

Items have separate `include_in_project_meeting` and `include_in_vendor_meeting` flags. The project agenda uses the project flag; the vendor agenda uses the vendor flag. Toggling one doesn't affect the other.

## Project Roles

Projects have three person-reference fields: `project_owner_id`, `project_manager_id`, `lead_qa_id` — set via OwnerPicker in the edit form, displayed below project metadata. Plus `project_vendor_owners` junction table for one vendor owner per vendor-project relationship.

## Project Members

`project_members` junction table controls project visibility. People added via the "People" section in the Docs tab can see and interact with the project even without assigned tasks. `user_visible_project_ids` RPC includes project_members.

## Status Change Notifications

When a RAID entry, action item, or blocker status changes:
- Reporter and owner get a digest notification
- **Verify (needs_verification)** on vendor-assigned items → Lead QA gets notified
- **Rejected** on vendor-assigned items → Vendor Owner gets notified

## Invite Flow (Custom SMTP)

Invites bypass Supabase's email system entirely:
1. `/api/invite` creates auth user via `createUser`, generates magic link via `generateLink`
2. Link routes through `/api/invite/verify` (server-side token verification, no PKCE)
3. Email sent via Gmail SMTP (`src/lib/email.ts`)
4. User clicks → `/api/invite/verify` verifies token → redirects to `/auth/callback#tokens` → `/set-password`
5. `/api/invite/accept` marks invitation accepted + links `profile_id`

Password reset uses the same flow via `/api/auth/reset-password`.

`sendEmail()` returns `{success, error}` — invite route returns 500 if email fails.

**Redirect URL fix**: Supabase may override `redirect_to` with its configured Site URL. All invite/resend endpoints rewrite the URL using the `URL` API before sending.

## Auto-Mark Read Trigger

`auto_mark_read` AFTER UPDATE trigger on `raid_entries` and `action_items` automatically upserts `item_reads` for the authenticated user (`auth.uid()`), preventing own changes from showing as unread. This covers all 26+ update paths without client-side code.

## Docs Template Sections

Project Docs tab has a hardcoded template index: Key Dates, Key Resources, Project Details, Core Audiences, Value Props, Marketing, Questions. Content stored in `project_documents` table. WYSIWYG editor (TipTap) with table support for editing. People, Files, and Notes sections below the HR separator.

## Steering Committee

Collapsible section on project headers and initiative detail pages (`steering-committee-section.tsx`):

### Steering Properties
- **Executive Sponsor** — OwnerPicker for selecting sponsor person
- **Steering Phase** — dropdown: in_progress, post_launch, parking_lot, upcoming, completed, on_hold
- **Steering Priority** — integer input for ordering within phase
- **Projected Completion Date** + notes textarea
- **Actual Completion Date** + notes textarea
- **Product Type** — free text field
- **Asana Link** — URL field with external link icon

### Department Status Cards
- 2-column grid of department cards with dark gray (`bg-gray-700`) headers
- Hardcoded departments: Marketing, Content/Education, Product/Technology, Sales, Finance, Compliance
- Each card has: traffic light status (green/yellow/red buttons), Owner (OwnerPicker for department rep), Roadblocks textarea, Decisions textarea
- Cards only shown when at least one department has a status set, or when editing
- Visibility: project owner, executive sponsor, or admin/super_admin can edit

### Health Override
When department statuses exist for a project, the project health badge derives from the worst traffic light:
- Any red → `blocked`
- Any yellow → `at_risk`
- All green → `on_track`
- This overrides the manually-set health field on the project

### Database
- `steering_phase` enum: `in_progress`, `post_launch`, `parking_lot`, `upcoming`, `completed`, `on_hold`
- `department_status` enum: `green`, `yellow`, `red`
- New columns on `projects`: `executive_sponsor_id`, `steering_priority`, `steering_phase`, `original_completion_date`, `original_completion_notes`, `actual_completion_date`, `actual_completion_notes`, `product_type`, `asana_link`
- Same steering columns on `initiatives`: `executive_sponsor_id`, `steering_priority`, `steering_phase`, `original_completion_date`/`notes`, `actual_completion_date`/`notes`
- `project_department_statuses` table: id, org_id, project_id (nullable), initiative_id (nullable), department, rep_person_id, status, roadblocks, decisions, sort_order
- Migrations: `20260406000001_steering_committee.sql`, `20260407000001_initiative_steering.sql`, `20260408000001_product_type_asana_link.sql`

## Reports Page

Client component (`/reports`) for steering committee reporting:

### Layout
- Sidebar link with `ClipboardList` icon between Timeline and Docs (hidden from vendors)
- Phase tabs across top with count badges (In Progress, Post Launch, Parking Lot, Upcoming, Completed, On Hold)
- Initiatives shown as full-width rows at top of each phase tab
- Standalone projects (no initiative) shown in 2-column card grid below initiatives
- Expanding an initiative row shows its child projects as a nested 2-column card grid

### Cards
- Priority number displayed prominently
- Health badge (colored pill)
- Traffic light dots (department status summary — green/yellow/red circles)
- Executive Sponsor name
- Product Type label
- Export to Excel button — multi-sheet workbook with one sheet per phase

### Access Control
- Project owners and executive sponsors see their own projects
- Nader and Veronica (matched by person name) see all projects
- Admins/super_admins see all projects
- Vendors cannot access reports page

### Component
`src/components/steering-report.tsx`

## Presentation Mode

Full-screen overlay for presenting steering reports:

### Activation
- "Present" button on reports page opens the overlay
- Escape key or close button to exit

### Layout
- Left sidebar: scrollable project list with priority numbers and traffic light status dots
- Main area: one large card per project showing priority, health badge, name, product type, executive sponsor, projected completion date
- "Show Details" toggle reveals: notes, department status cards with roadblocks/decisions, Asana link

### Navigation
- Click project in sidebar to jump to it
- Arrow keys (up/down) to page through projects
- Space bar toggles "Show Details"

### Component
`src/components/steering-presentation.tsx`

## Vendor Detail Page — Add Item & Changelog

### Add Item Button
- "+ Add Item" button inline with project tabs on vendor detail page
- Creates action items, blockers, or RAID issues directly on the vendor without requiring a project association
- New Project column in item table shows source project (clickable link) or dash for unassociated items

### Changelog in Detail Panels
- "View changelog" link in expanded detail panels for all entity types (action items, blockers, RAID entries)
- Same activity history modal as RAID log changelog

### Blocker Description Fix
- Description and Impact/Notes fields no longer share the same underlying field for blockers

## Tab-Based Initiatives

Initiatives with a `steering_phase` set are hidden from the sidebar Initiatives section. They appear only in the Reports page under their respective phase tabs. This prevents cluttering the sidebar with post-launch, parking lot, upcoming, completed, or on-hold initiatives that don't need daily visibility.

## Rejected Status

`rejected` added to `item_status` enum. Available in all status dropdowns. Red badge styling. Triggers vendor owner notification when set on vendor-assigned items.

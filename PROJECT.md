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
│   │   ├── reports/          # Steering committee reports + presentation mode
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
│   ├── roadmap-view.tsx      # Release Roadmap board (decisions + Jira tickets, votes, modal)
│   ├── comment-thread.tsx    # Reusable comment thread with file attachments
│   ├── vendor-picker.tsx     # Vendor selection dropdown with inline creation
│   ├── steering-committee-section.tsx # Shared steering committee UI (projects + initiatives)
│   ├── steering-report.tsx   # Reports page with card grid + phase tabs
│   ├── steering-presentation.tsx # Full-screen presentation mode
│   ├── project-header.tsx    # Project name + health badge + steering section
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
| `initiatives` | High-level strategic initiatives with steering committee fields |
| `projects` | Tracked projects with health status, steering committee fields (sponsor, phase, priority, completion dates, product type, asana link), and `modules text[]` controlling which tabs are visible (default `{actions,raid,docs}`; `actions` required) |
| `action_items` | Tasks with owner (person **or** vendor via `owner_vendor_id`), priority, `start_date` + due date, `section_id`, `parent_id` nesting (≤5 deep), meeting toggle |
| `action_item_sections` | Named sections for grouping action items within a project (read = org; write = non-vendor roles) |
| `blockers` | Blocking issues with impact description |
| `raid_entries` | Risks, assumptions, issues, decisions (owner, reporter, parent_id subtasks, sort_order, due_date) |
| `agenda_items` | Vendor/project meeting topics with severity/context/ask |
| `support_tickets` | External support requests |
| `intakes` | Raw text submissions for AI extraction |
| `comments` | Threaded comments on RAID entries, action items, blockers (polymorphic) |
| `comment_attachments` | File attachments on comments (Supabase Storage, public bucket) |
| `meetings` | Meeting records |
| `activity_log` | Audit trail |
| `term_corrections` | AI extraction glossary (wrong_term → correct_term) |
| `milestones` | Company timeline milestones with parent/child grouping |
| `wiki_pages` | Block-based wiki pages with parent/child hierarchy |
| `project_department_statuses` | Department status cards for steering committee (green/yellow/red per department) |
| `invitations` | Email-based invitations with role, token, expiry, accepted_at |
| `project_documents` | AI-generated + editable Docs-tab section content |
| `project_links` | External document links (Google Docs/Sheets/Slides) per project |
| `reminders` | Per-user alarm reminders on action/blocker/RAID items |
| `item_reads` | Per-user read tracking for unread/updated indicators |
| `comment_notifications` | Queued email-digest notifications (@mentions, owner comments, assignments, file shares, new-ticket alerts) |
| `jira_tickets` | Imported Jira tickets from the U2 board (xprepls.atlassian.net) for the Release Roadmap — key, summary, status, release target, epic, labels, PR refs, local due_date (not synced back to Jira) |
| `roadmap_votes` | Per-user 👍/👎 votes on roadmap cards (PK: profile + entity_type + entity_id; entity_type `raid_entry` \| `jira_ticket`) |
| `item_mentions` | Per-task @mention records (entity_type + entity_id + person_id), written by the `record_item_mentions` comment trigger; powers the assigned/opened/mentioned limited view. RLS default-deny — read via `user_mentioned_in()` |

### Junction Tables
`project_vendors`, `project_vendor_owners` (legacy, no longer written), `project_members` (carries `role` — the Team Member role that drives task permissions), `initiative_owners`, `meeting_projects`, `meeting_attendees`, `intake_entities`, `correction_log`

### Views
- `blocker_ages` — blockers with computed age
- `action_item_ages` — action items with computed age. Also exposes `section_id`, `start_date`, `owner_vendor_id`. ⚠️ Because `action_items` now has **two** FKs to `vendors` (`vendor_id` and `owner_vendor_id`), any PostgREST `vendor:vendors(*)` embed on this view/table **must** be disambiguated with the FK hint `vendor:vendors!action_items_vendor_id_fkey(*)` or it errors.
- `vendor_accountability` — combined action items + blockers per vendor

### Database Triggers (action items)
- `check_action_item_depth` — BEFORE INSERT/UPDATE of `parent_id`; rejects nesting deeper than 5 levels and parent cycles.
- `add_mentioned_to_project` — AFTER INSERT on `comments`; `@[Name](person_id)` mentions auto-add that person to `project_members` (grants visibility). SECURITY DEFINER.
- `notify_new_ticket` — AFTER INSERT on `action_items`; a new **top-level** ticket queues a `new_item` digest notification to the project's PM (`project_manager_id`), falling back to the product owner (`project_owner_id`). SECURITY DEFINER.

### RPC Functions
- `generate_vendor_agenda(vendor_id, limit)` — ranked vendor agenda with scoring
- `generate_project_agenda(project_id, limit)` — ranked project agenda
- `generate_project_agenda_from_selected(project_id, limit)` — agenda from items toggled for meeting (`include_in_meeting = true`)
- `reassign_project_owner(project_id, person_id)` — super_admin only; demotes the current Owner to Project Manager, promotes the given person, syncs `projects.project_owner_id`

### Key Enums
- **item_status:** pending, in_progress, complete, needs_verification, paused, at_risk, blocked, identified, assessing, mitigated, closed, rejected
- **priority_level:** critical, high, medium, low
- **project_health:** on_track, in_progress, at_risk, blocked, paused, complete
- **raid_type:** risk, assumption, issue, decision
- **steering_phase:** in_progress, post_launch, parking_lot, upcoming, completed, on_hold
- **department_status:** green, yellow, red
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
8. **PDF Intake** — drag-and-drop PDF files on the standalone intake page; client-side text extraction via pdfjs-dist with position-based spacing (the per-project Intake tab was removed — see feature 46)
9. **Asana Parser** — deterministic parser for Asana PDF exports; bypasses AI entirely for structured text extraction (separator-based block splitting, field parsing, person matching)
10. **Intelligent Scoring** — RPC-based agenda ranking: `priority_score + severity_score + escalation_count*10 + min(age,30)*2`
11. **Comments & Attachments** — threaded comments on RAID entries, action items, and blockers with file attachment support (Supabase Storage). Author auto-detected from logged-in user. Newest-first display with Cmd+Enter posting. File-only comments are supported, and deleting a comment removes its sanitized storage objects as well as its attachment rows.
12. **RAID Archived View** — "Archived" link below RAID type tabs shows all resolved items sorted by resolution date. Type label replaces ID, reopen button on each row. Resolve animation: green flash + collapse (350ms ease-out). Expanded archived/resolved details render description and meeting notes as rich text, including safe clickable attachment links from the public issue form.
13. **Vendor Picker** — all org vendors shown in RAID/Actions/Blockers detail panels with inline "+ Add Vendor" creation (like OwnerPicker for people)
14. **RAID Subtasks** — self-referencing `parent_id` on raid_entries. Disclosure triangle toggles children visible/hidden. Children indented with ↳ arrow. Parent dropdown in detail panel.
15. **RAID Drag-and-Drop** — native HTML5 drag-and-drop for reordering and nesting. Top/bottom 25% = reorder (blue line indicator), middle 50% = nest as subtask (blue highlight). Sort order via `sort_order` integer column with midpoint gaps. Same drag-and-drop ported to Action Items panel with cycle prevention.
16. **Company Timeline** — three-view timeline (Timeline, Calendar, Gantt) with milestone parent/child grouping, linked and proposed project/initiative milestones, "create from proposed" flow.
17. **Wiki** — block-based wiki pages with parent/child hierarchy, hosted at `/wiki`.
18. **RAID Due Date** — due_date column on raid_entries with InlineDate picker in detail panel, column toggle, and bulk editor. Smart display: past due (red italic), today/tomorrow labels, short date for future.
19. **RAID Changelog** — "View changelog" link in detail panel opens modal with activity history from `activity_log` table. Human-readable labels for owner, vendor, status, priority fields.
20. **Digest Deep Links** — each notification block in email digest links to the specific project page instead of just `/dashboard`.
21. **Unread Indicators** — NEW pill (never viewed) and red indicator (updated since last view). Comments bump `updated_at`. Own changes don't trigger indicators (auto_mark_read DB trigger).
22. **Vendor Detail Page** — project-tabbed item view (🔥 urgent, All, per-project), health report (A-F grade, 8 metrics), filters, expandable detail panels with comments, vendor reassignment.
23. **Two-Flag Meeting Toggle** — separate `include_in_project_meeting` and `include_in_vendor_meeting` flags. Project and vendor agendas are independent.
24. **Project Owner + Team Members (role-based)** — flat Team Members list (`project_members.role`) with a role dropdown per member: Owner (full incl. project delete, one per project, creator by default, super_admin-only reassignment via `reassign_project_owner` RPC), Project Manager (full, deletes any task), Product / QA (full, deletes own tasks), Member - Full (edits all, no create, deletes own legacy tasks), Member - Assigned / Vendor (limited to assigned/opened/mentioned tasks). An explicit project role supersedes the person's broader account role for that project, so a vendor account can be given full participation in one project without changing their access elsewhere. DB-enforced via RLS; account super_admin/admin bypass.
25. **Project Members** — `project_members` junction table for project visibility + the role above. Managed as Team Members in the Edit Project form (the Docs-tab People section was removed). The old behavior where any vendor added as a member automatically saw the full project was retired 2026-08-13. Visibility now follows the assigned project role: full roles see all project items, while Member - Assigned and Vendor remain limited to assigned/opened/mentioned items (plus vendor-company items for the Vendor role), backed by the `item_mentions` table. The account role is used only when the person has no explicit role in that project.
26. **Status Change Notifications** — digest notifications on status changes to reporter/owner. Verify → Lead QA, Rejected → Vendor Owner (routing reads the legacy role columns, which stopped being written 2026-08-13 — fires only where those were set before then; rewiring to team roles is an open follow-up).
27. **Custom Invite/Reset Flow** — bypasses Supabase email, uses Gmail SMTP + server-side token verification to avoid PKCE issues.
28. **Rejected Status** — new status option for items that fail QA review.
29. **WYSIWYG Docs Editor** — TipTap rich text editor with table support for project documentation sections.
30. **Vendor Health Report** — super_admin only, A-F letter grades based on ticket age, resolution time, QA bounce rate, ETA coverage, overdue rate.
31. **Action Item Changelog** — activity history modal matching RAID log changelog pattern.
32. **Dashboard My Tasks** — personal task list showing action items + RAID entries owned by logged-in user with grid layout.
33. **Steering Committee Section** — collapsible section on project headers and initiative detail with Executive Sponsor, Steering Phase, Priority, Completion Dates, Product Type, Asana Link, and Department Status cards (6 departments with traffic light statuses, owner, roadblocks, decisions). Health overrides from worst department status.
34. **Reports Page** — steering committee reporting with phase tabs (In Progress, Post Launch, Parking Lot, etc.), initiative rows with expandable child project grids, standalone project cards, Export to Excel (multi-sheet by phase). Access scoped to project owners, sponsors, named users (Nader, Veronica), and admins.
35. **Presentation Mode** — full-screen overlay for presenting steering reports. Left sidebar project list, large detail cards, Show Details toggle for department statuses. Arrow keys, Space, Esc navigation.
36. **Vendor Add Item** — create action items, blockers, or issues directly on vendor detail page without project association. Project column shows source project or dash.
37. **Initiative Dropdown** — project header allows reassigning projects between initiatives with sidebar refresh.
38. **Tab-Based Initiative Phases** — initiatives with steering_phase set are hidden from sidebar and shown only in Reports page under their phase tab.
39. **Action Item Sections** — group action items within a project under named, collapsible section headers (`action_item_sections` + `section_id`). Create/rename/delete via the panel header and section rows. Items without a section fall under "Ungrouped." Section/parent selectors in the add form; section selector in the detail panel.
40. **5-Level Action Item Nesting** — action items nest up to 5 deep (recursive render, depth-based indent, expand/collapse at any level). Enforced by the `check_action_item_depth` DB trigger and a client-side guard on drag-to-nest.
41. **@Mention Auto-Add to Project** — tagging someone in a task/blocker/RAID comment thread adds them as a `project_members` member (grants visibility) via the `add_mentioned_to_project` trigger.
42. **New-Ticket Alerts** — a new top-level action item queues a digest notification (`new_item`) to the project's PM, falling back to the product owner (`notify_new_ticket` trigger). Rendered as a purple block in the email digest.
43. **Task Start + End Dates** — `start_date` alongside `due_date`, both editable in the detail panel. The action-items list column is labeled **Dates** and shows a numeric range (`MM/DD/YY - MM/DD/YY`) when both are set, the single date otherwise, or a parent's child-due span.
44. **Vendor as Owner** — an action item's owner can be a person **or** a vendor (`owner_vendor_id`, mutually exclusive with `owner_id`). The Owner picker shows a "Vendors" group; the Owner column renders a purple vendor chip. Distinct from the `vendor_id` "associated vendor" field.
45. **Project Link in Header** — the project's `asana_link` is surfaced top-right of the project header (opposite the title); admins set/edit it inline.
46. **Project Modules** — per-project tab visibility via `projects.modules` (Action Items required; Blockers, RAID Log, Meeting Agenda, Docs, Roadmap optional). Toggled in the Edit Project form; tabs update live via a `project:modules-change` event. Default set: Action Items + RAID Log + Docs. The project Intake tab was removed entirely.
47. **Delete Project** — red button in the Edit Project form, restricted to the project's **Owner** (team role) or a super_admin (RLS `projects_delete` matches; the creator rule was retired 2026-08-13). Child items are detached (`ON DELETE SET NULL`), not deleted.
48. **Edit-Form Initiative Dropdown** — reassign a project's initiative from the Edit Project form; admins see all initiatives, other users only ones they own. The old inline header dropdown was removed.
49. **Release Roadmap** — time-bucketed drag-and-drop board (Week/Month/Quarter/Year) fed by pending Decisions, imported U2 Jira tickets, and opt-in cross-project Decisions/Issues ("+ Projects" picker). Columns: Unscheduled, collapsible In Progress (status- and PR-driven), Overdue, time buckets, Later. Dropping a card sets `due_date` to the end of the period; card modal has details, PR/Jira links, and per-user 👍/👎 voting (`roadmap_votes`).
50. **Jira Import (U2)** — one-off snapshot of R2-or-later tickets (Release Target field) into `jira_tickets` via `scripts/_import-jira-r2.mjs`; PR association mined from ed-cet/unified PR titles/branches via `scripts/_set-jira-pr-refs.mjs` (Jira's GitHub integration is unconnected). Live sync pending a `JIRA_API_TOKEN`.
51. **Public Form Priority Gate** — required Priority field on the public issue form; Critical shows a warning (reserved for customer-blocking issues) with a mandatory confirmation checkbox, enforced again server-side.
52. **Draggable Bulk Toolbar** — the RAID multi-select toolbar has a top grab strip to drag it anywhere on screen.

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
- **Comments section:** `bg-yellow-50/25` background matching panel tint. Comment textarea and Attach button are `bg-white`. Author avatar + name + relative time, delete on hover, file attachment chips. Post is enabled when the editor has text or at least one staged file.
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
| `20260319000001_project_files_bucket.sql` | `project-files` storage bucket for Docs-tab file uploads |
| `20260320000001_reminders.sql` | Reminders table for action/blocker/RAID items |
| `20260324000001_slack_member_id.sql` | Add `slack_member_id` to people for Slack DM links |
| `20260324000002_action_item_subtasks.sql` | Add `parent_id` + `sort_order` to action_items for subtask nesting |
| `20260326000001_item_reads.sql` | Item read tracking for unread/updated indicators |
| `20260326000002_salesforce_case_fields.sql` | Add `sf_case_id`, `sf_case_number`, `sf_case_url` to raid_entries |
| `20260326000003_vendor_see_personal_items.sql` | Vendor RLS: also see items assigned to them personally |
| `20260326000004_comment_notifications.sql` | Comment notification queue for email digests |
| `20260326000005_assignment_notifications.sql` | Extend notifications for assignment changes |
| `20260326000006_link_people_on_signup.sql` | Auto-link people.profile_id on user signup |
| `20260326000007_initiative_owner_visibility.sql` | Initiative owners see all projects under their initiatives |
| `20260326000008_initiative_owners.sql` | Junction table for multiple initiative owners |
| `20260326000009_mark_invite_accepted_on_signup.sql` | Auto-mark invitation accepted on signup |
| `20260327000001_notification_deep_links.sql` | Add `entity_id` + `project_slug` to comment_notifications for deep links |
| `20260327000002_raid_due_date.sql` | Add `due_date` column to raid_entries |
| `20260327000003_public_attachment_bucket.sql` | Make `comment-attachments` storage bucket public |
| `20260330000001_auto_mark_read_on_update.sql` | Auto-mark items as read for the user who updates them |
| `20260330000002_vendor_meeting_overhaul.sql` | Two-flag meeting toggle, RAID in vendor accountability, vendor agenda RPC update |
| `20260330000003_refresh_ages_views.sql` | Recreate blocker_ages/action_item_ages views for new columns |
| `20260331000001_project_members.sql` | Project members junction table for project visibility |
| `20260331000002_status_change_notifications.sql` | Status change notifications with changed_by and new_status |
| `20260401000001_fix_invite_accepted_timing.sql` | Don't auto-mark invitation accepted in handle_new_user trigger |
| `20260401000002_vendor_accountability_issues_only.sql` | Filter vendor accountability to issues only |
| `20260401000003_vendor_see_all_people.sql` | Allow vendors to see all people in org |
| `20260402000001_project_roles.sql` | Add lead_qa_id, project_manager_id, project_owner_id to projects |
| `20260402000002_vendor_owners.sql` | Vendor owners per project junction table |
| `20260402000003_add_rejected_status.sql` | Add 'rejected' to item_status enum |
| `20260402000004_vendor_accountability_updated_at.sql` | Add updated_at to vendor accountability view |
| `20260406000001_steering_committee.sql` | Steering phase/priority/sponsor on projects, department_status enum, project_department_statuses table |
| `20260407000001_initiative_steering.sql` | Steering columns on initiatives (sponsor, phase, priority, completion dates) |
| `20260408000001_product_type_asana_link.sql` | Add product_type and asana_link to projects and initiatives |
| `20260408000002_project_links.sql` | `project_links` table for external document links (Google Docs/Sheets/Slides, etc.) |
| `20260408000003_file_share_notifications.sql` | Allow `file_share` as a `comment_notifications` type |
| `20260409000001_agent_fields.sql` | Experimental agent fields on items (later removed) |
| `20260409000002_agent_auto_status.sql` | Experimental agent auto-status (later removed) |
| `20260410000001_fix_notification_insert_rls.sql` | Explicit INSERT policy on `comment_notifications` (FOR ALL/USING was blocking inserts) |
| `20260413000001_remove_agent_fields.sql` | Remove the experimental agent fields/columns |
| `20260415000001_junction_table_rls.sql` | Enable RLS on junction tables flagged by the Supabase security advisor |
| `20260415000002_views_security_invoker.sql` | Switch `blocker_ages`/`action_item_ages`/`vendor_accountability` views to SECURITY INVOKER so they respect RLS |
| `20260415000003_security_advisor_warnings.sql` | Set `search_path` on functions; remove anon access from `project-files` bucket |
| `20260415000004_fix_search_path.sql` | Set `search_path = 'public'` on helper/trigger functions |
| `20260415000005_issue_attachments_drop_select.sql` | Drop unneeded SELECT policies on the public `issue-attachments` bucket |
| `20260415000006_qualify_policy_functions.sql` | Qualify function calls (`public.`) in RLS policies to be search_path-resilient |
| `20260416000001_fix_owner_change_rls.sql` | Add WITH CHECK so owners (not just creators) can change `owner_id` |
| `20260430000001_log_entity_created.sql` | AFTER INSERT triggers write a `created` row to `activity_log`; backfill existing rows |
| `20260507000001_project_owner_admin.sql` | `user_is_project_admin(project_id)` helper; project owners + initiative owners get admin UPDATE/DELETE on action_items, blockers, raid_entries, agenda_items in their projects |
| `20260507000002_pm_is_project_admin.sql` | Extend `user_is_project_admin` to also cover `projects.project_manager_id` |
| `20260507000003_qa_lead_is_project_admin.sql` | Extend `user_is_project_admin` to also cover `projects.lead_qa_id` |
| `20260610000001_sections_nesting_membership.sql` | `action_item_sections` table + `section_id`; 5-level depth-guard trigger; `add_mentioned_to_project` trigger; allow `new_item` notification type |
| `20260610000002_new_ticket_alerts.sql` | `notify_new_ticket` trigger — new top-level ticket → digest alert to PM (fallback product owner) |
| `20260610000003_action_item_ages_section_id.sql` | Expose `section_id` through `action_item_ages` |
| `20260610000004_sections_rls_least_privilege.sql` | Sections RLS: org-wide read, non-vendor write |
| `20260610000005_action_item_start_date.sql` | `start_date` on action_items, exposed via `action_item_ages` |
| `20260610000006_action_item_owner_vendor.sql` | `owner_vendor_id` (vendor as owner) on action_items, exposed via `action_item_ages` |
| `20260615000001_scope_vendor_project_visibility.sql` | Scope `projects_select` for vendors to `vendor_visible_project_ids()` (no more org-wide project leak) |
| `20260701000001_vendor_project_member_item_visibility.sql` | Vendor `project_members` see ALL items in their projects; `user_project_member_ids()` helper added to vendor SELECT policies (RETIRED by `20260813000002`) |
| `20260702000001_qa_role_enum.sql` | Add `qa` to the `user_role` enum |
| `20260702000002_qa_role_policies.sql` | QA account-role policies: INSERT parity with `user`; project-member QA updates any task, deletes own (superseded by `20260813000002`'s role-aware rewrite) |
| `20260727000001_raid_issue_type.sql` | `issue_type` column on raid_entries (Issues only) with CHECK constraint |
| `20260727000002_raid_issue_type_ext_system.sql` | Add `ext_system` issue type for third-party-system defects |
| `20260727000003_status_migrated_to_jira.sql` | Add `migrated_to_jira` to the `item_status` enum |
| `20260728000001_issue_type_align_form.sql` | Align `issue_type` values with the public issue form's shared list (`lib/issue-types.ts`) |
| `20260804000001_project_creator_delete.sql` | `projects_delete` policy: only the creator or a super_admin (admins lose blanket delete) |
| `20260804000002_project_roadmap.sql` | `roadmap_enabled` boolean on projects (superseded same day by modules) |
| `20260804000003_project_modules.sql` | `modules text[]` on projects (default `{actions,raid,docs}`), backfill + drop `roadmap_enabled` |
| `20260804000004_jira_tickets_and_votes.sql` | `jira_tickets` table (imported U2 board tickets) + `roadmap_votes` table with RLS |
| `20260804000005_jira_pr_refs.sql` | `has_pr` + `pr_numbers` on jira_tickets (mined from ed-cet/unified PRs) |
| `20260806000001_raid_business_unit.sql` | `business_unit` column on raid_entries (Issues detail panel) |
| `20260806000002_business_unit_split_product_development.sql` | Split the combined `product_development` unit into `product` + `development` |
| `20260806000003_jira_plain_summary_description.sql` | `plain_summary`/`auto_summary` + description fields on jira_tickets for plain-language roadmap cards |
| `20260806000004_jira_business_unit.sql` | `business_unit` on jira_tickets (roadmap-local, never pushed to Jira) |
| `20260807000001_business_unit_add_finance.sql` | Widen the business-unit CHECKs to include `finance` |
| `20260813000001_team_members.sql` | Team Members replace per-project roles: `role_label` on `project_members`, backfill of PM/Lead QA/Vendor Owners as labeled members, `project_members` UPDATE policy (+ qa parity on insert/delete), `user_is_project_admin` = owner OR team member OR initiative owner |
| `20260813000002_member_roles.sql` | Member roles: `project_members.role` (owner/project_manager/product/qa/member_full/member_assigned/vendor) + backfill, one-owner index, creator-becomes-owner trigger, `reassign_project_owner` RPC (super_admin), `item_mentions` table + comment-mention trigger/backfill, full role-aware RLS rewrite on action_items/raid_entries/blockers + projects_delete (owner or super_admin) |
| `20260819000001_project_role_precedence.sql` | Makes an explicit `project_members.role` authoritative for that project across action items, RAID entries, and blockers. The account role is the fallback only when no project membership exists; account admin/super_admin retain their emergency bypass. |

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
| [`supabase/migrations/`](https://github.com/sparrowia/tracker/tree/main/supabase/migrations) | Full database schema history |
| [`.env.local.example`](https://github.com/sparrowia/tracker/blob/main/.env.local.example) | Required environment variables |
| [`PROMPT.md`](https://github.com/sparrowia/tracker/blob/main/PROMPT.md) | Bootstrap prompt for AI assistants |

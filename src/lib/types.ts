export type ItemStatus =
  | "pending"
  | "in_progress"
  | "complete"
  | "needs_verification"
  | "paused"
  | "at_risk"
  | "blocked"
  | "identified"
  | "assessing"
  | "mitigated"
  | "closed"
  | "rejected";

export type PriorityLevel = "critical" | "high" | "medium" | "low";

export type ProjectHealth =
  | "on_track"
  | "in_progress"
  | "at_risk"
  | "blocked"
  | "paused"
  | "complete";

export type RaidType = "risk" | "assumption" | "issue" | "decision";

export type MilestoneType = "project" | "initiative" | "proposed_project" | "proposed_initiative";

export type MilestoneStatus = "pending" | "in_progress" | "complete";

export type SeverityIndicator = "critical" | "high" | "new" | "normal";

export type UserRole = "super_admin" | "admin" | "user" | "vendor";

export type SteeringPhase =
  | "in_progress"
  | "post_launch"
  | "parking_lot"
  | "upcoming"
  | "completed"
  | "on_hold";

export type DepartmentStatusLevel = "green" | "yellow" | "red";

export type IntakeSource =
  | "slack"
  | "email"
  | "meeting_notes"
  | "manual"
  | "fathom_transcript"
  | "spreadsheet"
  | "asana";

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  deactivated_at: string | null;
  vendor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: string;
  org_id: string;
  project_id: string;
  section_key: string;
  section_title: string;
  content: string;
  sort_order: number;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  vendor_id: string | null;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  website: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  slack_member_id: string | null;
  title: string | null;
  vendor_id: string | null;
  is_internal: boolean;
  profile_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
}

export interface Initiative {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  health: ProjectHealth;
  owner_id: string | null;
  target_completion: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  owner?: Person;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  health: ProjectHealth;
  platform_status: string | null;
  start_date: string | null;
  target_completion: string | null;
  notes: string | null;
  initiative_id: string | null;
  public_issue_form: boolean;
  lead_qa_id: string | null;
  project_manager_id: string | null;
  project_owner_id: string | null;
  executive_sponsor_id: string | null;
  steering_priority: number | null;
  steering_phase: SteeringPhase | null;
  original_completion_date: string | null;
  original_completion_notes: string | null;
  actual_completion_date: string | null;
  actual_completion_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendors?: Vendor[];
  initiative?: Initiative;
}

export interface ActionItem {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  status: ItemStatus;
  priority: PriorityLevel;
  due_date: string | null;
  first_flagged_at: string;
  resolved_at: string | null;
  notes: string | null;
  next_steps: string | null;
  stage: string | null;
  include_in_meeting: boolean;
  include_in_project_meeting: boolean;
  include_in_vendor_meeting: boolean;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: Person;
  vendor?: Vendor;
  project?: Project;
  // computed
  age_days?: number;
  days_overdue?: number;
  urgency?: string;
}

export interface RaidEntry {
  id: string;
  org_id: string;
  raid_type: RaidType;
  display_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  next_steps: string | null;
  impact: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  owner_id: string | null;
  reporter_id: string | null;
  vendor_id: string | null;
  decision_date: string | null;
  due_date: string | null;
  stage: string | null;
  include_in_meeting: boolean;
  include_in_project_meeting: boolean;
  include_in_vendor_meeting: boolean;
  parent_id: string | null;
  sort_order: number;
  first_flagged_at: string;
  resolved_at: string | null;
  sf_case_id: string | null;
  sf_case_number: string | null;
  sf_case_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: Person;
  vendor?: Vendor;
  project?: Project;
}

export interface Blocker {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  impact_description: string | null;
  owner_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  status: ItemStatus;
  priority: PriorityLevel;
  first_flagged_at: string;
  resolved_at: string | null;
  due_date: string | null;
  include_in_meeting: boolean;
  include_in_project_meeting: boolean;
  include_in_vendor_meeting: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: Person;
  vendor?: Vendor;
  project?: Project;
  // computed
  age_days?: number;
  age_severity?: string;
}

export interface SupportTicket {
  id: string;
  org_id: string;
  ticket_number: string;
  system: string | null;
  title: string | null;
  description: string | null;
  vendor_id: string | null;
  project_id: string | null;
  status: ItemStatus;
  priority: PriorityLevel;
  opened_at: string | null;
  resolved_at: string | null;
  external_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  project?: Project;
}

export interface Meeting {
  id: string;
  org_id: string;
  title: string;
  meeting_date: string | null;
  duration_minutes: number | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaItem {
  id: string;
  org_id: string;
  vendor_id: string | null;
  project_id: string | null;
  title: string;
  severity: SeverityIndicator;
  context: string | null;
  ask: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  first_raised_at: string;
  resolved_at: string | null;
  action_item_id: string | null;
  blocker_id: string | null;
  raid_entry_id: string | null;
  support_ticket_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
}

export interface Intake {
  id: string;
  org_id: string;
  raw_text: string;
  source: IntakeSource;
  extraction_status: string;
  extracted_data: Record<string, unknown> | null;
  submitted_by: string | null;
  vendor_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorAccountabilityRow {
  entity_type: "action_item" | "blocker" | "raid_entry";
  entity_id: string;
  vendor_id: string;
  org_id: string;
  title: string;
  status: ItemStatus;
  priority: PriorityLevel;
  due_date: string | null;
  first_flagged_at: string;
  age_days: number;
  updated_at: string;
  owner_id: string | null;
  project_id: string | null;
  owner?: Person;
  project?: Project;
}

export interface TermCorrection {
  id: string;
  org_id: string;
  wrong_term: string;
  correct_term: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorAgendaRow {
  rank: number;
  entity_type: string;
  entity_id: string;
  title: string;
  severity: SeverityIndicator;
  context: string | null;
  ask: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  due_date: string | null;
  age_days: number;
  score: number;
  owner_name: string | null;
  project_name: string | null;
  project_slug: string | null;
  owner_id: string | null;
  vendor_id: string | null;
}

export interface Comment {
  id: string;
  org_id: string;
  raid_entry_id: string | null;
  action_item_id: string | null;
  blocker_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author?: Person;
  attachments?: CommentAttachment[];
}

export interface CommentAttachment {
  id: string;
  org_id: string;
  comment_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  target_date: string;
  milestone_type: MilestoneType;
  initiative_id: string | null;
  project_id: string | null;
  owner_id: string | null;
  status: MilestoneStatus;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: Person;
  initiative?: Initiative;
  project?: Project;
}

export interface WikiPage {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  content: Record<string, unknown>;
  parent_id: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectAgendaRow {
  rank: number;
  entity_type: string;
  entity_id: string;
  title: string;
  severity: SeverityIndicator;
  context: string | null;
  ask: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  due_date: string | null;
  age_days: number;
  score: number;
  owner_name: string | null;
  vendor_name: string | null;
  owner_id: string | null;
  vendor_id: string | null;
}

export interface ProjectDepartmentStatus {
  id: string;
  org_id: string;
  project_id: string;
  department: string;
  rep_person_id: string | null;
  status: DepartmentStatusLevel | null;
  roadblocks: string | null;
  decisions: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  rep?: Person;
}

export const STEERING_DEPARTMENTS = [
  "Marketing",
  "Content/Education",
  "Product/Technology",
  "Sales",
  "Finance",
  "Compliance",
] as const;

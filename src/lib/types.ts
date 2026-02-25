export type ItemStatus =
  | "pending"
  | "in_progress"
  | "complete"
  | "needs_verification"
  | "paused"
  | "at_risk"
  | "blocked";

export type PriorityLevel = "critical" | "high" | "medium" | "low";

export type ProjectHealth =
  | "on_track"
  | "in_progress"
  | "at_risk"
  | "blocked"
  | "paused"
  | "complete";

export type RaidType = "risk" | "action" | "issue" | "decision";

export type SeverityIndicator = "critical" | "high" | "new" | "normal";

export type IntakeSource =
  | "slack"
  | "email"
  | "meeting_notes"
  | "manual"
  | "fathom_transcript";

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
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Person {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  vendor_id: string | null;
  is_internal: boolean;
  profile_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
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
  created_at: string;
  updated_at: string;
  vendors?: Vendor[];
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
  escalation_count: number;
  resolved_at: string | null;
  notes: string | null;
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
  impact: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  owner_id: string | null;
  vendor_id: string | null;
  decision_date: string | null;
  first_flagged_at: string;
  escalation_count: number;
  resolved_at: string | null;
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
  escalation_count: number;
  resolved_at: string | null;
  due_date: string | null;
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
  vendor_id: string;
  title: string;
  severity: SeverityIndicator;
  context: string | null;
  ask: string | null;
  priority: PriorityLevel;
  status: ItemStatus;
  first_raised_at: string;
  escalation_count: number;
  resolved_at: string | null;
  action_item_id: string | null;
  blocker_id: string | null;
  raid_entry_id: string | null;
  support_ticket_id: string | null;
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
  entity_type: "action_item" | "blocker";
  entity_id: string;
  vendor_id: string;
  org_id: string;
  title: string;
  status: ItemStatus;
  priority: PriorityLevel;
  due_date: string | null;
  first_flagged_at: string;
  escalation_count: number;
  age_days: number;
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
  age_days: number;
  escalation_count: number;
  score: number;
  owner_name: string | null;
  project_name: string | null;
}

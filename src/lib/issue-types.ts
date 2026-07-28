import type { IssueType } from "./types";

/**
 * Canonical issue-type list. Single source of truth for BOTH the public
 * reporting form (`/issues/[slug]`) and the Type column in the RAID log, which
 * are required to stay identical — a reporter picks a value here and it lands
 * in the Type column unchanged, with no translation step to drift out of sync.
 *
 * Slugs are stored; labels are displayed. The DB CHECK constraint on
 * `raid_entries.issue_type` must list exactly these slugs (see
 * 20260728000001_issue_type_align_form.sql).
 *
 * Ordered alphabetically by label, with "Other" pinned last so the catch-all
 * does not sit mid-list where it gets picked by accident.
 */
export const ISSUE_TYPE_OPTIONS: IssueType[] = [
  "accessibility",
  "broken_link",
  "bug",
  "content",
  "error",
  "ext_system",
  "feature_request",
  "functionality",
  "media",
  "navigation",
  "performance",
  "responsive",
  "security",
  "support_request",
  "ui_ux",
  "other",
];

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  accessibility: "Accessibility",
  broken_link: "Broken Link",
  bug: "Bug",
  content: "Content",
  error: "Error",
  ext_system: "Ext System",
  feature_request: "Feature Request",
  functionality: "Functionality",
  media: "Media",
  navigation: "Navigation",
  performance: "Performance",
  responsive: "Responsive Issue",
  security: "Security",
  support_request: "Support Request",
  ui_ux: "UI/UX",
  other: "Other",
};

/**
 * Feature requests are not defects — they are proposals awaiting a call, so a
 * form submission of this type is filed as a Decision (D##) rather than an
 * Issue (I##). See the submit route.
 */
export const FEATURE_REQUEST_TYPE: IssueType = "feature_request";

export function isIssueType(value: unknown): value is IssueType {
  return typeof value === "string" && (ISSUE_TYPE_OPTIONS as string[]).includes(value);
}

/**
 * Accepts a slug, or a display label as posted by an older build of the public
 * form. The label path exists only so a reporter with the form already open in
 * a tab does not get a validation error after a deploy; it can be dropped once
 * no stale clients remain.
 */
export function resolveIssueType(value: unknown): IssueType | null {
  if (isIssueType(value)) return value;
  if (typeof value !== "string") return null;
  const legacy = value.trim().toLowerCase();
  const match = ISSUE_TYPE_OPTIONS.find(
    (t) => ISSUE_TYPE_LABEL[t].toLowerCase() === legacy
  );
  if (match) return match;
  // Pre-rename label from the original form list.
  if (legacy === "performance - load or lag times") return "performance";
  return null;
}

import type { BusinessUnit } from "./types";

/**
 * Business Unit — which internal team owns an issue. Replaces the old Impact
 * field in the Issues editor (Impact stayed a free-text/low-medium-high muddle
 * and was never used consistently; see the note on `raid_entries.impact`).
 *
 * Slugs are stored; labels are displayed. The DB CHECK constraints on
 * `raid_entries.business_unit` AND `jira_tickets.business_unit` must both list
 * exactly these slugs (see 20260806000001_raid_business_unit.sql,
 * 20260806000004_jira_business_unit.sql, and 20260807000001 for Finance).
 * Adding an option here without the matching migration fails at write time.
 *
 * Ordered alphabetically by label — no pinned catch-all here, unlike
 * ISSUE_TYPE_OPTIONS where "Other" sits last.
 */
export const BUSINESS_UNIT_OPTIONS: BusinessUnit[] = [
  "compliance",
  "development",
  "finance",
  "la_team",
  "marketing",
  "operations",
  "product",
  "sales",
];

export const BUSINESS_UNIT_LABEL: Record<BusinessUnit, string> = {
  compliance: "Compliance",
  development: "Development",
  finance: "Finance",
  la_team: "LA Team",
  marketing: "Marketing",
  operations: "Operations",
  product: "Product",
  sales: "Sales",
};

export function isBusinessUnit(value: unknown): value is BusinessUnit {
  return typeof value === "string" && (BUSINESS_UNIT_OPTIONS as string[]).includes(value);
}

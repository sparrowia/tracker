import { type PriorityLevel, type ItemStatus, type ProjectHealth, type SeverityIndicator, type MilestoneType, type MilestoneStatus } from "./types";

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatAge(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 14) return "1 week";
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 60) return "1 month";
  return `${Math.floor(days / 30)} months`;
}

export function priorityLabel(priority: PriorityLevel): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function priorityColor(priority: PriorityLevel): string {
  switch (priority) {
    case "critical": return "text-red-700 bg-red-50 border-red-200";
    case "high": return "text-orange-700 bg-orange-50 border-orange-200";
    case "medium": return "text-yellow-700 bg-yellow-50 border-yellow-200";
    case "low": return "text-gray-600 bg-gray-50 border-gray-200";
  }
}

export function priorityDot(priority: PriorityLevel): string {
  switch (priority) {
    case "critical": return "bg-red-500";
    case "high": return "bg-orange-500";
    case "medium": return "bg-yellow-500";
    case "low": return "bg-gray-400";
  }
}

export function statusBadge(status: ItemStatus): { label: string; className: string } {
  switch (status) {
    case "pending": return { label: "Pending", className: "text-gray-700 bg-gray-100" };
    case "in_progress": return { label: "In Progress", className: "text-blue-700 bg-blue-100" };
    case "complete": return { label: "Complete", className: "text-green-700 bg-green-100" };
    case "needs_verification": return { label: "Verify", className: "text-purple-700 bg-purple-100" };
    case "paused": return { label: "Paused", className: "text-gray-600 bg-gray-200" };
    case "at_risk": return { label: "At Risk", className: "text-amber-700 bg-amber-100" };
    case "blocked": return { label: "Blocked", className: "text-red-700 bg-red-100" };
    case "identified": return { label: "Identified", className: "text-slate-700 bg-slate-100" };
    case "assessing": return { label: "Assessing", className: "text-indigo-700 bg-indigo-100" };
    case "mitigated": return { label: "Mitigated", className: "text-teal-700 bg-teal-100" };
    case "closed": return { label: "Closed", className: "text-green-700 bg-green-100" };
  }
}

export function healthColor(health: ProjectHealth): string {
  switch (health) {
    case "on_track": return "text-green-700 bg-green-50 border-green-200";
    case "in_progress": return "text-blue-700 bg-blue-50 border-blue-200";
    case "at_risk": return "text-amber-700 bg-amber-50 border-amber-200";
    case "blocked": return "text-red-700 bg-red-50 border-red-200";
    case "paused": return "text-gray-600 bg-gray-50 border-gray-200";
    case "complete": return "text-green-700 bg-green-50 border-green-200";
  }
}

export function healthLabel(health: ProjectHealth): string {
  return health.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function severityBadge(severity: SeverityIndicator): { label: string; className: string } {
  switch (severity) {
    case "critical": return { label: "Critical", className: "text-red-700 bg-red-100" };
    case "high": return { label: "High", className: "text-orange-700 bg-orange-100" };
    case "new": return { label: "New", className: "text-blue-700 bg-blue-100" };
    case "normal": return { label: "Normal", className: "text-gray-600 bg-gray-100" };
  }
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  // Parse YYYY-MM-DD as local time to avoid UTC timezone shift
  const [y, m, d] = date.split("-").map(Number);
  if (y && m && d) {
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function milestoneTypeLabel(type: MilestoneType): string {
  switch (type) {
    case "project": return "Project";
    case "initiative": return "Initiative";
    case "proposed_project": return "Proposed Project";
    case "proposed_initiative": return "Proposed Initiative";
  }
}

export function milestoneTypeColor(type: MilestoneType): string {
  switch (type) {
    case "project": return "text-blue-700 bg-blue-50 border-blue-200";
    case "initiative": return "text-purple-700 bg-purple-50 border-purple-200";
    case "proposed_project": return "text-blue-500 bg-blue-50/50 border-dashed border-blue-300";
    case "proposed_initiative": return "text-purple-500 bg-purple-50/50 border-dashed border-purple-300";
  }
}

export function milestoneStatusLabel(status: MilestoneStatus): string {
  switch (status) {
    case "pending": return "Pending";
    case "in_progress": return "In Progress";
    case "complete": return "Complete";
  }
}

export function milestoneStatusColor(status: MilestoneStatus): string {
  switch (status) {
    case "pending": return "text-gray-700 bg-gray-100";
    case "in_progress": return "text-blue-700 bg-blue-100";
    case "complete": return "text-green-700 bg-green-100";
  }
}

export function formatDateShort(date: string | null): string {
  if (!date) return "—";
  // Parse YYYY-MM-DD as local time to avoid UTC timezone shift
  const [y, m, d] = date.split("-").map(Number);
  if (y && m && d) {
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

import type { UserRole } from "./types";

export function canCreate(role: UserRole): boolean {
  return role !== "vendor";
}

export function canDelete(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

// Item-aware delete: admins delete anything; QA deletes their OWN tasks
// (creator or owner) on projects they belong to — RLS is the backstop.
export function canDeleteItem(
  role: UserRole,
  profileId: string,
  item: { created_by?: string | null; owner_id?: string | null },
  userPersonId: string | null
): boolean {
  if (canDelete(role)) return true;
  if (role !== "qa") return false;
  if (item.created_by && item.created_by === profileId) return true;
  if (userPersonId && item.owner_id === userPersonId) return true;
  return false;
}

export function canEditItem(
  role: UserRole,
  profileId: string,
  item: { created_by?: string | null; owner_id?: string | null },
  userPersonId: string | null
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "vendor") return true; // Vendors can edit — changes are tracked in changelog
  if (role === "qa") return true; // QA edits anything on their projects — RLS enforces membership
  // User role: can edit if creator or owner
  if (item.created_by && item.created_by === profileId) return true;
  if (userPersonId && item.owner_id === userPersonId) return true;
  return false;
}

export function canUpdateStatus(role: UserRole): boolean {
  return true; // All roles can update status
}

export function canInvite(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function isAdmin(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function canEditWikiPage(
  role: UserRole,
  profileId: string,
  page: { created_by?: string | null }
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "vendor") return false;
  return !!(page.created_by && page.created_by === profileId);
}

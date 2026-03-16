import type { UserRole } from "./types";

export function canCreate(role: UserRole): boolean {
  return role !== "vendor";
}

export function canDelete(role: UserRole): boolean {
  return role === "super_admin" || role === "admin";
}

export function canEditItem(
  role: UserRole,
  profileId: string,
  item: { created_by?: string | null; owner_id?: string | null },
  userPersonId: string | null
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "vendor") return false;
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

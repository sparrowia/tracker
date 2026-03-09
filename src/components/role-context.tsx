"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/types";

interface RoleContextValue {
  role: UserRole;
  profileId: string;
  orgId: string;
  vendorId: string | null;
  userPersonId: string | null;
}

const RoleContext = createContext<RoleContextValue>({
  role: "user",
  profileId: "",
  orgId: "",
  vendorId: null,
  userPersonId: null,
});

export function RoleProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: RoleContextValue;
}) {
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  return useContext(RoleContext);
}

"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { UserRole } from "@/lib/types";

interface Impersonation {
  personId: string;
  personName: string;
  role: UserRole;
  vendorId: string | null;
}

interface RoleContextValue {
  role: UserRole;
  profileId: string;
  orgId: string;
  vendorId: string | null;
  userPersonId: string | null;
  impersonation: Impersonation | null;
  stopImpersonation: () => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: "user",
  profileId: "",
  orgId: "",
  vendorId: null,
  userPersonId: null,
  impersonation: null,
  stopImpersonation: () => {},
});

interface RoleProviderProps {
  children: React.ReactNode;
  value: {
    role: UserRole;
    profileId: string;
    orgId: string;
    vendorId: string | null;
    userPersonId: string | null;
  };
}

export function RoleProvider({ children, value }: RoleProviderProps) {
  const [impersonation, setImpersonation] = useState<Impersonation | null>(null);

  // Load impersonation from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("impersonation");
      if (stored) setImpersonation(JSON.parse(stored));
    } catch {}
  }, []);

  // Listen for impersonation changes from other components
  useEffect(() => {
    function handleChange() {
      try {
        const stored = sessionStorage.getItem("impersonation");
        setImpersonation(stored ? JSON.parse(stored) : null);
      } catch {}
    }
    window.addEventListener("impersonation-change", handleChange);
    return () => window.removeEventListener("impersonation-change", handleChange);
  }, []);

  const stopImpersonation = useCallback(() => {
    sessionStorage.removeItem("impersonation");
    setImpersonation(null);
  }, []);

  // When impersonating, override role and vendorId
  const effectiveRole = impersonation ? impersonation.role as UserRole : value.role;
  const effectiveVendorId = impersonation ? impersonation.vendorId : value.vendorId;

  return (
    <RoleContext.Provider
      value={{
        role: effectiveRole,
        profileId: value.profileId,
        orgId: value.orgId,
        vendorId: effectiveVendorId,
        userPersonId: impersonation ? impersonation.personId : value.userPersonId,
        impersonation,
        stopImpersonation,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

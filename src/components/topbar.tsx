"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useRole } from "@/components/role-context";
import type { Profile } from "@/lib/types";

export function Topbar({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const supabase = createClient();
  const { impersonation, stopImpersonation } = useRole();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <>
      {impersonation && (
        <div className="bg-purple-600 px-4 py-1.5 flex items-center justify-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-200">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span className="text-sm text-white font-medium">
            Viewing as <strong>{impersonation.personName}</strong>
            <span className="ml-1.5 text-purple-200">({impersonation.role.replace(/_/g, " ")})</span>
          </span>
          <button
            onClick={stopImpersonation}
            className="text-xs text-white bg-purple-500 hover:bg-purple-400 px-2 py-0.5 rounded transition-colors font-medium"
          >
            Stop
          </button>
        </div>
      )}
      <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6">
        <div className="md:hidden font-semibold text-gray-900">Edcetera</div>
        <div className="hidden md:block" />

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {profile?.full_name || "User"}
          </span>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>
    </>
  );
}

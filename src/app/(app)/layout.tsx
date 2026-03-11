import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { RoleProvider } from "@/components/role-context";
import type { UserRole } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: personRecord }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("people").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);

  const role = (profile?.role || "user") as UserRole;

  return (
    <RoleProvider
      value={{
        role,
        profileId: user.id,
        orgId: profile?.org_id || "",
        vendorId: profile?.vendor_id || null,
        userPersonId: personRecord?.id || null,
      }}
    >
      <div className="flex h-screen bg-gray-50">
        <Sidebar role={role} profileId={user.id} userPersonId={personRecord?.id || null} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Topbar profile={profile} />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </RoleProvider>
  );
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invitation_id } = await request.json();
  if (!invitation_id) {
    return NextResponse.json({ error: "invitation_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the invitation to find the email
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, org_id")
    .eq("id", invitation_id)
    .eq("org_id", profile.org_id)
    .single();

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  // Find and delete the auth user created by inviteUserByEmail
  const { data: { users } } = await admin.auth.admin.listUsers();
  const authUser = users.find(
    (u) => u.email?.toLowerCase() === invitation.email.toLowerCase()
  );

  if (authUser) {
    // Delete the profile first (if it exists), then the auth user
    await admin.from("profiles").delete().eq("id", authUser.id);
    await admin.auth.admin.deleteUser(authUser.id);
  }

  // Delete the invitation
  await admin.from("invitations").delete().eq("id", invitation_id);

  return NextResponse.json({ success: true });
}

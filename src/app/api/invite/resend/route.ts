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

  const body = await request.json();
  const { invitation_id } = body as { invitation_id: string };

  if (!invitation_id) {
    return NextResponse.json(
      { error: "invitation_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Get the invitation
  const { data: invitation, error: fetchError } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitation_id)
    .eq("org_id", profile.org_id)
    .is("accepted_at", null)
    .single();

  if (fetchError || !invitation) {
    return NextResponse.json(
      { error: "Invitation not found" },
      { status: 404 }
    );
  }

  // Reset expiry
  const { error: updateError } = await admin
    .from("invitations")
    .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
    .eq("id", invitation_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Re-send auth invite
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "";
  const { error: authError } = await admin.auth.admin.inviteUserByEmail(
    invitation.email,
    {
      data: {
        org_id: invitation.org_id,
        role: invitation.role,
        vendor_id: invitation.vendor_id,
      },
      redirectTo: `${siteUrl}/auth/callback`,
    }
  );

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

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

  // Get caller profile and verify admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, role, vendor_id } = body as {
    email: string;
    role: string;
    vendor_id?: string;
  };

  // Validate
  if (!email || !role) {
    return NextResponse.json(
      { error: "Email and role are required" },
      { status: 400 }
    );
  }

  if (!["admin", "user", "vendor"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Cannot assign super_admin." },
      { status: 400 }
    );
  }

  if (role === "vendor" && !vendor_id) {
    return NextResponse.json(
      { error: "Vendor role requires a vendor_id" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check for existing user with same email
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .eq("org_id", profile.org_id)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Check for pending invite
  const { data: existingInvite } = await admin
    .from("invitations")
    .select("id")
    .eq("email", email)
    .eq("org_id", profile.org_id)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingInvite) {
    return NextResponse.json(
      { error: "An invitation for this email is already pending" },
      { status: 409 }
    );
  }

  // Insert invitation
  const { data: invitation, error: inviteError } = await admin
    .from("invitations")
    .insert({
      org_id: profile.org_id,
      email,
      role,
      vendor_id: vendor_id || null,
      invited_by: profile.id,
    })
    .select()
    .single();

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // Send auth invite email via Supabase
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get("origin") || "";
  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      org_id: profile.org_id,
      role,
      vendor_id: vendor_id || null,
    },
    redirectTo: `${siteUrl}/auth/callback`,
  });

  if (authError) {
    // Clean up invitation if email send failed
    await admin.from("invitations").delete().eq("id", invitation.id);
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ invitation });
}

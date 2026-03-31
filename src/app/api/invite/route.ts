import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

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

  // Create auth user and generate invite link (without Supabase sending email)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";
  const { data: linkData, error: authError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        org_id: profile.org_id,
        role,
        vendor_id: vendor_id || null,
      },
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (authError) {
    // Clean up invitation if user creation failed
    await admin.from("invitations").delete().eq("id", invitation.id);
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Send invite email through our own Gmail SMTP
  const inviteLink = linkData?.properties?.action_link;
  if (inviteLink) {
    await sendEmail({
      to: email,
      subject: "You're invited to Edcetera Tracker",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <h2 style="color: #1f2937; margin-bottom: 16px;">You've been invited to Edcetera Tracker</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
            You've been invited to join the Edcetera project management tracker as a <strong>${role}</strong>.
          </p>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
            Click the button below to set up your password and get started.
          </p>
          <div style="margin: 24px 0;">
            <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${inviteLink}" style="color: #6b7280;">${inviteLink}</a>
          </p>
        </div>
      `,
    });
  }

  return NextResponse.json({ invitation });
}

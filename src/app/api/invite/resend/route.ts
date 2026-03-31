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

  // Generate invite link (user may already exist from prior invite)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";
  const { data: linkData, error: authError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: invitation.email,
    options: {
      data: {
        org_id: invitation.org_id,
        role: invitation.role,
        vendor_id: invitation.vendor_id,
      },
      redirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (authError) {
    // User already exists — generate a magic link instead
    const { data: magicData } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: invitation.email,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    const link = magicData?.properties?.action_link;
    if (link) {
      await sendEmail({
        to: invitation.email,
        subject: "Your Edcetera Tracker invitation (resent)",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
            <h2 style="color: #1f2937; margin-bottom: 16px;">Your invitation to Edcetera Tracker</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">Click below to set up your password and get started.</p>
            <div style="margin: 24px 0;">
              <a href="${link}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Accept Invitation</a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">Or paste this link: <a href="${link}" style="color: #6b7280;">${link}</a></p>
          </div>
        `,
      });
    }
    return NextResponse.json({ success: true });
  }

  // Send invite email through Gmail SMTP
  const inviteLink = linkData?.properties?.action_link;
  if (inviteLink) {
    await sendEmail({
      to: invitation.email,
      subject: "Your Edcetera Tracker invitation (resent)",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
          <h2 style="color: #1f2937; margin-bottom: 16px;">Your invitation to Edcetera Tracker</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">Click below to set up your password and get started.</p>
          <div style="margin: 24px 0;">
            <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">Accept Invitation</a>
          </div>
          <p style="color: #9ca3af; font-size: 12px;">Or paste this link: <a href="${inviteLink}" style="color: #6b7280;">${inviteLink}</a></p>
        </div>
      `,
    });
  }

  return NextResponse.json({ success: true });
}

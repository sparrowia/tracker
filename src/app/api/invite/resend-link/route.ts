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

  const { email } = (await request.json()) as { email: string };
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

  // Try magic link first (works for existing users)
  let link: string | undefined;
  const { data: magicData, error: magicErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (!magicErr && magicData?.properties?.action_link) {
    link = magicData.properties.action_link;
  } else {
    // User doesn't exist yet — try invite link
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { org_id: profile.org_id },
        redirectTo: `${siteUrl}/auth/callback`,
      },
    });
    if (inviteErr) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }
    link = inviteData?.properties?.action_link;
  }

  if (!link) {
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }

  // Fix redirect URL — Supabase may override with its configured Site URL
  link = link.replace(/redirect_to=[^&]+/, `redirect_to=${encodeURIComponent(siteUrl + "/auth/callback")}`);

  await sendEmail({
    to: email,
    subject: "Your Edcetera Tracker invitation",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">You're invited to Edcetera Tracker</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
          Click the button below to set up your password and get started.
        </p>
        <div style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px;">
          If the button doesn't work, copy and paste this link into your browser:<br/>
          <a href="${link}" style="color: #6b7280;">${link}</a>
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true });
}

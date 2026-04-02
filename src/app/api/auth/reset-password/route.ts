import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

  // Generate a magic link (server-side, bypasses PKCE)
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
  });

  if (error) {
    // Don't reveal whether the email exists
    return NextResponse.json({ success: true });
  }

  let link = data?.properties?.action_link;
  if (!link) {
    return NextResponse.json({ success: true });
  }

  // Route through our server-side verify to avoid PKCE
  const parsed = new URL(link);
  const token = parsed.searchParams.get("token");
  const type = parsed.searchParams.get("type") || "magiclink";
  if (token) {
    link = `${siteUrl}/api/invite/verify?token=${encodeURIComponent(token)}&type=${type}`;
  }

  const emailResult = await sendEmail({
    to: email,
    subject: "Reset your Edcetera Tracker password",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">Reset Your Password</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
          Click the button below to set a new password for your Edcetera Tracker account.
        </p>
        <div style="margin: 24px 0;">
          <a href="${link}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            Reset Password
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px;">
          If you didn't request this, you can ignore this email.<br/>
          Or paste this link: <a href="${link}" style="color: #6b7280;">${link}</a>
        </p>
      </div>
    `,
  });

  if (!emailResult.success) {
    return NextResponse.json({ error: "Failed to send email: " + emailResult.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

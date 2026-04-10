import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recipients, fileName, fileUrl, note, projectSlug } = await req.json();

  if (!recipients || recipients.length === 0 || !fileName || !fileUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

  // Get sender name
  const { data: profile } = await supabase.from("people").select("full_name").eq("profile_id", user.id).single();
  const senderName = profile?.full_name || "Someone";

  let sent = 0;
  for (const r of recipients as { email: string; name: string }[]) {
    const projectLink = projectSlug ? `${siteUrl}/projects/${projectSlug}` : siteUrl;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; font-size: 16px; margin-bottom: 16px;">
          ${senderName} shared a file with you
        </h2>
        <div style="padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 3px solid #3b82f6; margin-bottom: 16px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #1f2937; font-weight: 600;">
            📎 ${fileName}
          </p>
          ${note ? `<p style="margin: 0 0 12px; font-size: 13px; color: #374151;">${note.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
          <a href="${fileUrl}" style="display: inline-block; padding: 8px 16px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500;">
            Open File →
          </a>
        </div>
        ${projectSlug ? `<a href="${projectLink}" style="color: #3b82f6; text-decoration: none; font-size: 12px;">View Project →</a>` : ""}
        <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
          Edcetera Tracker · <a href="${siteUrl}" style="color: #3b82f6; text-decoration: none;">Sign in</a> to view and manage your items.
        </p>
      </div>
    `;

    const result = await sendEmail({
      to: r.email,
      subject: `${senderName} shared "${fileName}" with you`,
      html,
    });

    if (result.success) sent++;
  }

  return NextResponse.json({ success: true, sent });
}

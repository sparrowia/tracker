import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

  // Fetch all unsent notifications
  const { data: notifications, error } = await admin
    .from("comment_notifications")
    .select("*")
    .is("sent_at", null)
    .order("created_at");

  if (error || !notifications || notifications.length === 0) {
    return NextResponse.json({ success: true, sent: 0 });
  }

  // Group by recipient email
  const byRecipient = new Map<string, typeof notifications>();
  for (const n of notifications) {
    const arr = byRecipient.get(n.recipient_email) || [];
    arr.push(n);
    byRecipient.set(n.recipient_email, arr);
  }

  let totalSent = 0;
  const sentIds: string[] = [];

  for (const [email, items] of byRecipient) {
    const assignments = items.filter((n) => n.mention_type === "assignment");
    const comments = items.filter((n) => n.mention_type !== "assignment");
    const totalCount = items.length;

    const subject = totalCount === 1
      ? items[0].mention_type === "assignment"
        ? `You've been assigned: ${items[0].item_title}`
        : `New comment on ${items[0].item_type}: ${items[0].item_title}`
      : `${totalCount} new notifications from Edcetera Tracker`;

    const assignmentBlocks = assignments.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #22c55e;">
        <p style="margin: 0; font-size: 12px; color: #6b7280;">
          <strong>${n.assigned_by || "Someone"}</strong> assigned you to ${n.item_type}: <strong>${n.item_title}</strong>${n.project_name ? ` · ${n.project_name}` : ""}
        </p>
      </div>
    `).join("");

    const commentBlocks = comments.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid ${n.mention_type === "mention" ? "#3b82f6" : "#8b5cf6"};">
        <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
          <strong>${n.commenter_name || "Someone"}</strong> ${n.mention_type === "mention" ? "mentioned you" : "commented on your item"} · ${n.item_type}: <strong>${n.item_title}</strong>${n.project_name ? ` · ${n.project_name}` : ""}
        </p>
        ${n.comment_body ? `<p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${n.comment_body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>` : ""}
      </div>
    `).join("");

    const heading = assignments.length > 0 && comments.length > 0
      ? `${totalCount} New Notifications`
      : assignments.length > 0
      ? assignments.length === 1 ? "New Assignment" : `${assignments.length} New Assignments`
      : comments.length === 1 ? "New Comment" : `${comments.length} New Comments`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; font-size: 16px; margin-bottom: 16px;">
          ${heading}
        </h2>
        ${assignmentBlocks}${commentBlocks}
        <p style="margin-top: 20px;">
          <a href="${siteUrl}/dashboard" style="color: #3b82f6; text-decoration: none; font-size: 13px;">Open Tracker →</a>
        </p>
        <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
          Edcetera Tracker · You received this because you were mentioned or are the item owner.
        </p>
      </div>
    `;

    await sendEmail({ to: email, subject, html });
    totalSent++;
    sentIds.push(...items.map((n) => n.id));
  }

  // Mark as sent
  if (sentIds.length > 0) {
    await admin
      .from("comment_notifications")
      .update({ sent_at: new Date().toISOString() })
      .in("id", sentIds);
  }

  return NextResponse.json({ success: true, sent: totalSent, notifications: sentIds.length });
}

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
    const statusChanges = items.filter((n) => n.mention_type === "status_change");
    const fileShares = items.filter((n) => n.mention_type === "file_share");
    const comments = items.filter((n) => !["assignment", "status_change", "file_share"].includes(n.mention_type));
    const totalCount = items.length;

    const subject = totalCount === 1
      ? items[0].mention_type === "file_share"
        ? `${items[0].assigned_by || "Someone"} shared "${items[0].item_title}" with you`
        : items[0].mention_type === "assignment"
        ? `You've been assigned: ${items[0].item_title}`
        : items[0].mention_type === "status_change"
        ? `Status updated: ${items[0].item_title}`
        : `New comment on ${items[0].item_type}: ${items[0].item_title}`
      : `${totalCount} new notifications from Edcetera Tracker`;

    function itemLink(n: typeof items[0]): string {
      if (!n.project_slug) return `${siteUrl}/dashboard`;
      const base = `${siteUrl}/projects/${n.project_slug}`;
      if (!n.entity_id) return base;
      // Map item_type to tab name
      const type = (n.item_type || "").toLowerCase();
      let tab = "raid";
      if (type.includes("action")) tab = "actions";
      else if (type.includes("blocker")) tab = "blockers";
      return `${base}?tab=${tab}&item=${n.entity_id}`;
    }

    const assignmentBlocks = assignments.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #22c55e;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
          <strong>${n.assigned_by || "Someone"}</strong> assigned you to ${n.item_type}: <strong>${n.item_title}</strong>${n.project_name ? ` · ${n.project_name}` : ""}
        </p>
        <a href="${itemLink(n)}" style="color: #3b82f6; text-decoration: none; font-size: 12px;">Open in Tracker →</a>
      </div>
    `).join("");

    const statusChangeBlocks = statusChanges.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #fefce8; border-radius: 8px; border-left: 3px solid #eab308;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
          <strong>${n.changed_by || "Someone"}</strong> changed status to <strong>${n.new_status || "unknown"}</strong> · ${n.item_type}: <strong>${n.item_title}</strong>${n.project_name ? ` · ${n.project_name}` : ""}
        </p>
        <a href="${itemLink(n)}" style="color: #3b82f6; text-decoration: none; font-size: 12px;">Open in Tracker →</a>
      </div>
    `).join("");

    const fileShareBlocks = fileShares.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #eff6ff; border-radius: 8px; border-left: 3px solid #3b82f6;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
          <strong>${n.assigned_by || "Someone"}</strong> shared a file with you: <strong>${n.item_title}</strong>
        </p>
        ${n.comment_body ? `<p style="margin: 0 0 8px; font-size: 13px; color: #374151;">${n.comment_body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : ""}
        ${n.shared_url ? `<a href="${n.shared_url}" style="color: #3b82f6; text-decoration: none; font-size: 12px;">Open File →</a>` : ""}
      </div>
    `).join("");

    const commentBlocks = comments.map((n) => `
      <div style="margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid ${n.mention_type === "mention" ? "#3b82f6" : "#8b5cf6"};">
        <p style="margin: 0 0 4px; font-size: 12px; color: #6b7280;">
          <strong>${n.commenter_name || "Someone"}</strong> ${n.mention_type === "mention" ? "mentioned you" : "commented on your item"} · ${n.item_type}: <strong>${n.item_title}</strong>${n.project_name ? ` · ${n.project_name}` : ""}
        </p>
        ${n.comment_body ? `<p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${n.comment_body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>` : ""}
        <a href="${itemLink(n)}" style="color: #3b82f6; text-decoration: none; font-size: 12px;">Open in Tracker →</a>
      </div>
    `).join("");

    const categoryCount = [assignments.length > 0, statusChanges.length > 0, fileShares.length > 0, comments.length > 0].filter(Boolean).length;
    const heading = categoryCount > 1 || totalCount > 1
      ? `${totalCount} New Notifications`
      : assignments.length === 1 ? "New Assignment"
      : statusChanges.length === 1 ? "Status Update"
      : "New Comment";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; font-size: 16px; margin-bottom: 16px;">
          ${heading}
        </h2>
        ${assignmentBlocks}${statusChangeBlocks}${fileShareBlocks}${commentBlocks}
        <p style="margin-top: 16px; font-size: 11px; color: #9ca3af;">
          Edcetera Tracker · <a href="${siteUrl}" style="color: #3b82f6; text-decoration: none;">Sign in</a> to view and manage your items.
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

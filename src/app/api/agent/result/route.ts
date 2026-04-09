import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const AGENT_SECRET = process.env.AGENT_SECRET;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (AGENT_SECRET && authHeader !== `Bearer ${AGENT_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { entity_type, entity_id, status, comment, pr_url, agent_id } = body;

  if (!entity_type || !entity_id || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const tableName = entity_type === "action_item" ? "action_items" : entity_type === "raid_entry" ? "raid_entries" : "blockers";

  // Update the task status
  const updates: Record<string, unknown> = {
    agent_status: status === "success" ? "agent_done" : null,
    status: status === "success" ? "needs_verification" : "pending",
  };

  await admin.from(tableName).update(updates).eq("id", entity_id);

  // Post a comment with the result
  if (comment || pr_url) {
    // Get org_id from the entity
    const { data: entity } = await admin.from(tableName).select("org_id, title").eq("id", entity_id).single();
    if (entity) {
      const commentBody = [
        comment || "Task completed by Claude AI Agent.",
        pr_url ? `\nPR: ${pr_url}` : "",
      ].join("");

      const commentData: Record<string, unknown> = {
        org_id: entity.org_id,
        body: commentBody,
        author_id: agent_id || null,
      };

      // Set the right FK based on entity type
      if (entity_type === "action_item") commentData.action_item_id = entity_id;
      else if (entity_type === "raid_entry") commentData.raid_entry_id = entity_id;
      else if (entity_type === "blocker") commentData.blocker_id = entity_id;

      await admin.from("comments").insert(commentData);
    }
  }

  return NextResponse.json({ success: true });
}

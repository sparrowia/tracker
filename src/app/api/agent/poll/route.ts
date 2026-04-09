import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const AGENT_SECRET = process.env.AGENT_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (AGENT_SECRET && authHeader !== `Bearer ${AGENT_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find the Claude agent person
  const { data: agent } = await admin
    .from("people")
    .select("id")
    .eq("is_agent", true)
    .limit(1)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "No agent person found" }, { status: 404 });
  }

  // Find tasks assigned to Claude that are pending
  const [{ data: actions }, { data: raids }, { data: blockers }] = await Promise.all([
    admin
      .from("action_items")
      .select("id, title, description, notes, next_steps, priority, status, project_id")
      .eq("owner_id", agent.id)
      .eq("agent_status", "pending_agent")
      .order("priority")
      .limit(10),
    admin
      .from("raid_entries")
      .select("id, title, description, notes, next_steps, priority, status, raid_type, project_id")
      .eq("owner_id", agent.id)
      .eq("agent_status", "pending_agent")
      .order("priority")
      .limit(10),
    admin
      .from("blockers")
      .select("id, title, description, impact_description, priority, status, project_id")
      .eq("owner_id", agent.id)
      .eq("agent_status", "pending_agent")
      .order("priority")
      .limit(10),
  ]);

  // Enrich with project info (repo, working dir)
  const allProjectIds = new Set<string>();
  for (const item of [...(actions || []), ...(raids || []), ...(blockers || [])]) {
    if (item.project_id) allProjectIds.add(item.project_id);
  }

  const projectMap: Record<string, { name: string; slug: string; repo_url: string | null; working_directory: string | null }> = {};
  if (allProjectIds.size > 0) {
    const { data: projects } = await admin
      .from("projects")
      .select("id, name, slug, repo_url, working_directory")
      .in("id", Array.from(allProjectIds));
    for (const p of (projects || [])) {
      projectMap[p.id] = { name: p.name, slug: p.slug, repo_url: p.repo_url, working_directory: p.working_directory };
    }
  }

  // Also fetch recent comments on each task for context
  const tasks = [
    ...(actions || []).map((a) => ({ entity_type: "action_item" as const, ...a })),
    ...(raids || []).map((r) => ({ entity_type: "raid_entry" as const, ...r })),
    ...(blockers || []).map((b) => ({ entity_type: "blocker" as const, ...b })),
  ].map((item) => ({
    ...item,
    project: item.project_id ? projectMap[item.project_id] || null : null,
  }));

  return NextResponse.json({ tasks, agent_id: agent.id });
}

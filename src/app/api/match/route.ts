import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { MATCH_SYSTEM_PROMPT } from "@/lib/ai/prompts/match";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { intake_id, vendor_id, project_id } = await request.json();

    if (!intake_id) {
      return NextResponse.json({ error: "Missing intake_id" }, { status: 400 });
    }

    // Fetch intake and org in parallel
    const [{ data: intake }, { data: profile }] = await Promise.all([
      supabase.from("intakes").select("extracted_data, vendor_id, project_id").eq("id", intake_id).single(),
      supabase.from("profiles").select("org_id").eq("id", user.id).single(),
    ]);

    if (!intake?.extracted_data || !profile?.org_id) {
      return NextResponse.json({ matches: {} });
    }

    const orgId = profile.org_id;
    const scopeVendorId = vendor_id || intake.vendor_id || null;
    const scopeProjectId = project_id || intake.project_id || null;

    const extracted = intake.extracted_data as Record<string, { title?: string; subject?: string; notes?: string; impact?: string; impact_description?: string; rationale?: string; mitigation?: string; details?: string; new_status?: string }[]>;

    // Build queries — scope to vendor/project, include recently closed (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    function buildActionQuery() {
      let q = supabase.from("action_items").select("id, title, status, priority").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`status.neq.complete,updated_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    function buildBlockerQuery() {
      let q = supabase.from("blockers").select("id, title, status, priority, resolved_at").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`resolved_at.is.null,resolved_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    function buildRaidQuery() {
      let q = supabase.from("raid_entries").select("id, title, status, priority, raid_type").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`status.neq.complete,updated_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    const [{ data: actions }, { data: blockers }, { data: raids }] = await Promise.all([
      buildActionQuery(),
      buildBlockerQuery(),
      buildRaidQuery(),
    ]);

    // Build extracted items text — including status_updates
    const extractedLines: string[] = [];
    const categories = ["action_items", "decisions", "issues", "risks", "blockers", "status_updates"] as const;
    for (const cat of categories) {
      const items = extracted[cat] || [];
      items.forEach((item, idx) => {
        const key = `${cat}-${idx}`;
        const extra = item.notes || item.impact || item.impact_description || item.rationale || item.mitigation || item.details || "";
        const statusNote = item.new_status ? ` (status: ${item.new_status})` : "";
        extractedLines.push(`${key}: "${item.title || item.subject}"${statusNote}${extra ? ` [notes: ${extra}]` : ""}`);
      });
    }

    // Build existing items text and lookup map
    const existingLines: string[] = [];
    const existingMap = new Map<string, { title: string; status: string; priority: string; table: string; raid_type?: string }>();

    for (const a of (actions || [])) {
      const closed = a.status === "complete" ? " [CLOSED]" : "";
      existingLines.push(`[A] ${a.id}: "${a.title}" (${a.status}, ${a.priority})${closed}`);
      existingMap.set(a.id, { title: a.title, status: a.status, priority: a.priority, table: "action_items" });
    }
    for (const b of (blockers || [])) {
      const closed = b.resolved_at ? " [CLOSED]" : "";
      existingLines.push(`[B] ${b.id}: "${b.title}" (${b.status}, ${b.priority})${closed}`);
      existingMap.set(b.id, { title: b.title, status: b.status, priority: b.priority, table: "blockers" });
    }
    for (const r of (raids || [])) {
      const prefix = r.raid_type === "risk" ? "R" : r.raid_type === "issue" ? "I" : r.raid_type === "assumption" ? "AS" : "D";
      const closed = r.status === "complete" ? " [CLOSED]" : "";
      existingLines.push(`[${prefix}] ${r.id}: "${r.title}" (${r.status}, ${r.priority})${closed}`);
      existingMap.set(r.id, { title: r.title, status: r.status, priority: r.priority, table: "raid_entries", raid_type: r.raid_type });
    }

    if (extractedLines.length === 0 || existingLines.length === 0) {
      return NextResponse.json({ matches: {} });
    }

    const scopeNote = scopeProjectId
      ? "Note: Items are scoped to the same project. Matching should be more aggressive within the same project context."
      : scopeVendorId
        ? "Note: Items are scoped to the same vendor. Matching should be more aggressive within the same vendor context."
        : "";

    const userContent = `${scopeNote ? scopeNote + "\n\n" : ""}NEWLY EXTRACTED:\n${extractedLines.join("\n")}\n\nEXISTING ITEMS:\n${existingLines.join("\n")}`;

    const result = await callDeepSeek<{ matches: Record<string, { existing_id: string; confidence: string; reason: string }[]> }>({
      system: MATCH_SYSTEM_PROMPT,
      user: userContent,
    });

    if (!result.ok) {
      return NextResponse.json({ matches: {} });
    }

    const rawMatches = result.data.matches || {};

    // Enrich matches with existing item data
    const enriched: Record<string, { existing_id: string; existing_table: string; title: string; status: string; priority: string; raid_type?: string; confidence: string; reason: string }[]> = {};

    for (const [key, candidates] of Object.entries(rawMatches)) {
      const enrichedCandidates = [];
      for (const c of candidates) {
        const existing = existingMap.get(c.existing_id);
        if (existing) {
          enrichedCandidates.push({
            existing_id: c.existing_id,
            existing_table: existing.table,
            title: existing.title,
            status: existing.status,
            priority: existing.priority,
            raid_type: existing.raid_type,
            confidence: c.confidence,
            reason: c.reason,
          });
        }
      }
      if (enrichedCandidates.length > 0) {
        enriched[key] = enrichedCandidates;
      }
    }

    return NextResponse.json({ matches: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

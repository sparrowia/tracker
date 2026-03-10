import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SYSTEM_PROMPT = `You are a project documentation generator. Given structured project management data, produce a factual project document organized into discrete sections.

CRITICAL RULES:
- ONLY state facts that are explicitly present in the data. Never assume, infer, or fabricate information.
- If a field says "Owner: Olivia Wolf", write "Olivia Wolf" — do NOT write "Unassigned".
- Copy names, statuses, dates, and priorities EXACTLY as they appear in the data.
- If data for a section is empty or not provided, skip that section entirely.
- Do NOT add commentary, recommendations, or observations that aren't directly supported by the data.

Return a JSON object with a "sections" array. Each section has:
- "key": a short snake_case identifier
- "title": a human-readable section title
- "content": the section content in markdown format

Generate these sections in order (skip any with no data):

1. "overview" — Project Overview
   Template: Project name, description, health status, linked initiative, vendors involved.

2. "stakeholders" — Stakeholders & Team
   Template: List each person from the PEOPLE data with their title and whether they are internal or a vendor contact. Group by internal vs. vendor.

3. "action_items" — Action Items
   Template: Use a markdown table with columns: Item | Priority | Status | Owner | Due Date | Age. List every action item exactly as provided.

4. "blockers" — Blockers
   Template: Use a markdown table with columns: Blocker | Priority | Status | Owner | Age. List every blocker exactly as provided.

5. "risks" — Risk Register
   Template: Use a markdown table with columns: Risk | Priority | Status | Owner | Impact. List every risk exactly as provided.

6. "issues" — Issues
   Template: Use a markdown table with columns: Issue | Priority | Status | Owner | Stage | Age. List every issue exactly as provided.

7. "decisions" — Key Decisions
   Template: Use a markdown table with columns: Decision | Status | Owner | Date. List every decision exactly as provided.

8. "assumptions" — Assumptions
   Template: Use a markdown table with columns: Assumption | Priority | Status | Owner. List every assumption exactly as provided.

9. "vendor_summary" — Vendor Summary
   Template: For each vendor linked to the project, list their open action items, blockers, and RAID entries. Only include vendors that appear in the data.

Formatting rules:
- Use markdown tables for item lists (they render well)
- Use **bold** for the section title only
- Keep it factual and structured — this is a reference document, not a narrative`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
    if (!profile?.org_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const { project_id } = await request.json();
    if (!project_id) return NextResponse.json({ error: "No project_id" }, { status: 400 });

    const orgId = profile.org_id;

    // Fetch project data in parallel
    const [projectRes, actionsRes, blockersRes, raidRes, pvRes] = await Promise.all([
      supabase.from("projects").select("*, initiative:initiatives(name)").eq("id", project_id).single(),
      supabase.from("action_item_ages").select("*, owner:people!action_items_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("blocker_ages").select("*, owner:people!blockers_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("raid_entries").select("*, owner:people!raid_entries_owner_id_fkey(id, full_name, title, is_internal, vendor_id), reporter:people!raid_entries_reporter_id_fkey(id, full_name, title, is_internal, vendor_id), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("project_vendors").select("vendor:vendors(id, name)").eq("project_id", project_id),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const actions = (actionsRes.data || []) as Row[];
    const blockers = (blockersRes.data || []) as Row[];
    const raidEntries = (raidRes.data || []) as Row[];

    // Collect people and vendor IDs actually referenced in this project's data
    const referencedPersonIds = new Set<string>();
    const referencedVendorIds = new Set<string>();

    // From project's linked vendors
    const projectVendors = ((pvRes.data || []) as Row[]).map((pv: Row) => pv.vendor).filter(Boolean);
    projectVendors.forEach((v: Row) => referencedVendorIds.add(v.id));

    // From action items
    actions.forEach((a: Row) => {
      const owner = a.owner as Row | null;
      const vendor = a.vendor as Row | null;
      if (owner?.id) referencedPersonIds.add(owner.id);
      if (vendor?.id) referencedVendorIds.add(vendor.id);
    });

    // From blockers
    blockers.forEach((b: Row) => {
      const owner = b.owner as Row | null;
      const vendor = b.vendor as Row | null;
      if (owner?.id) referencedPersonIds.add(owner.id);
      if (vendor?.id) referencedVendorIds.add(vendor.id);
    });

    // From RAID entries
    raidEntries.forEach((r: Row) => {
      const owner = r.owner as Row | null;
      const reporter = r.reporter as Row | null;
      const vendor = r.vendor as Row | null;
      if (owner?.id) referencedPersonIds.add(owner.id);
      if (reporter?.id) referencedPersonIds.add(reporter.id);
      if (vendor?.id) referencedVendorIds.add(vendor.id);
    });

    // Fetch only referenced people
    let people: Row[] = [];
    if (referencedPersonIds.size > 0) {
      const { data } = await supabase
        .from("people")
        .select("full_name, title, is_internal, vendor:vendors(name)")
        .in("id", Array.from(referencedPersonIds));
      people = (data || []) as Row[];
    }

    // Build context string
    const sections: string[] = [];

    sections.push(`PROJECT: ${project.name}
Health: ${project.health || "unknown"}
Description: ${project.description || "none"}
Notes: ${project.notes || "none"}
Initiative: ${(project.initiative as Row)?.name || "none"}`);

    // Only list vendors linked to this project
    if (projectVendors.length > 0) {
      sections.push(`VENDORS (${projectVendors.length}): ${projectVendors.map((v: Row) => v.name).join(", ")}`);
    }

    if (people.length > 0) {
      sections.push(`PEOPLE INVOLVED IN THIS PROJECT (${people.length}):\n${people.map((p: Row) => {
        const vendor = (p.vendor as Row)?.name;
        return `- ${p.full_name}${p.title ? ` (${p.title})` : ""} — ${p.is_internal ? "internal" : `vendor: ${vendor || "unknown"}`}`;
      }).join("\n")}`);
    }

    if (actions.length > 0) {
      sections.push(`ACTION ITEMS (${actions.length}):\n${actions.map((a: Row) => {
        const ownerName = (a.owner as Row | null)?.full_name || "Unassigned";
        const vendorName = (a.vendor as Row | null)?.name;
        return `- [${a.priority}/${a.status}] ${a.title} | Owner: ${ownerName}${vendorName ? ` | Vendor: ${vendorName}` : ""}${a.due_date ? ` | Due: ${a.due_date}` : ""}${a.age_days != null ? ` | Age: ${a.age_days}d` : ""}${a.stage ? ` | Stage: ${a.stage}` : ""}`;
      }).join("\n")}`);
    }

    if (blockers.length > 0) {
      sections.push(`BLOCKERS (${blockers.length}):\n${blockers.map((b: Row) => {
        const ownerName = (b.owner as Row | null)?.full_name || "Unassigned";
        const vendorName = (b.vendor as Row | null)?.name;
        return `- [${b.priority}/${b.status}] ${b.title} | Owner: ${ownerName}${vendorName ? ` | Vendor: ${vendorName}` : ""}${b.age_days != null ? ` | Age: ${b.age_days}d` : ""}`;
      }).join("\n")}`);
    }

    const risks = raidEntries.filter((r: Row) => r.raid_type === "risk");
    const issues = raidEntries.filter((r: Row) => r.raid_type === "issue");
    const decisions = raidEntries.filter((r: Row) => r.raid_type === "decision");
    const assumptions = raidEntries.filter((r: Row) => r.raid_type === "assumption");

    function formatRaid(label: string, items: Row[]) {
      if (!items.length) return "";
      return `${label} (${items.length}):\n${items.map((r: Row) => {
        const owner = (r.owner as Row)?.full_name || "Unassigned";
        const vendor = (r.vendor as Row)?.name;
        return `- [${r.priority}/${r.status}] ${r.title} | Owner: ${owner}${vendor ? ` | Vendor: ${vendor}` : ""}${r.description ? ` | ${r.description}` : ""}${r.impact ? ` | Impact: ${r.impact}` : ""}${r.stage ? ` | Stage: ${r.stage}` : ""}${r.decision_date ? ` | Date: ${r.decision_date}` : ""}${r.resolved_at ? ` | Resolved: ${r.resolved_at.slice(0, 10)}` : ""}`;
      }).join("\n")}`;
    }

    if (risks.length) sections.push(formatRaid("RISKS", risks));
    if (issues.length) sections.push(formatRaid("ISSUES", issues));
    if (decisions.length) sections.push(formatRaid("DECISIONS", decisions));
    if (assumptions.length) sections.push(formatRaid("ASSUMPTIONS", assumptions));

    const dataContext = sections.join("\n\n");

    const result = await callDeepSeek<{ sections: { key: string; title: string; content: string }[] }>({
      system: SYSTEM_PROMPT,
      user: `Generate comprehensive project documentation from this data:\n\n${dataContext}`,
      maxTokens: 4000,
      temperature: 0.2,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const generatedSections = result.data.sections || [];
    const now = new Date().toISOString();

    // Delete existing docs for this project, then insert new ones
    await supabase.from("project_documents").delete().eq("project_id", project_id);

    if (generatedSections.length > 0) {
      const rows = generatedSections.map((s, i) => ({
        org_id: orgId,
        project_id,
        section_key: s.key,
        section_title: s.title,
        content: s.content,
        sort_order: i,
        generated_at: now,
      }));
      await supabase.from("project_documents").insert(rows);
    }

    // Fetch back the inserted docs
    const { data: docs } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", project_id)
      .order("sort_order");

    return NextResponse.json({ sections: docs || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

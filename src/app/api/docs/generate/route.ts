import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SYSTEM_PROMPT = `You are a project documentation generator. Given structured project management data, produce a comprehensive project document organized into discrete sections.

Return a JSON object with a "sections" array. Each section has:
- "key": a short snake_case identifier (e.g. "overview", "stakeholders", "risks_and_issues")
- "title": a human-readable section title
- "content": the section content in markdown format

Generate these sections in order:
1. "overview" - Project Overview: name, description, health status, key dates, vendors involved
2. "stakeholders" - Stakeholders & Team: internal team members and vendor contacts involved, their roles
3. "action_items" - Action Items Summary: organized by status/priority, who owns what, due dates
4. "blockers" - Active Blockers: current blockers, their impact, who is responsible
5. "risks" - Risk Register: identified risks, their priority, mitigation status
6. "issues" - Issues Log: active issues, priority, ownership, stage
7. "decisions" - Key Decisions: decisions made, their status (pending/final), dates
8. "assumptions" - Assumptions: documented assumptions and their status
9. "timeline" - Timeline & Milestones: synthesized from due dates, ages, and project context
10. "vendor_summary" - Vendor Summary: what each vendor is responsible for, their open items

Rules:
- Write in clear, professional project management language
- Use markdown formatting: headers (##, ###), bullet points, bold for emphasis, tables where helpful
- Only include sections that have relevant data — skip empty sections
- Be factual — only use information from the provided data, never invent
- For each section, summarize and organize the data meaningfully, don't just list raw items
- Keep content concise but comprehensive`;

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

    // Fetch all project data in parallel
    const [projectRes, actionsRes, blockersRes, raidRes, peopleRes, vendorsRes] = await Promise.all([
      supabase.from("projects").select("*, initiative:initiatives(name)").eq("id", project_id).single(),
      supabase.from("action_item_ages").select("*").eq("project_id", project_id),
      supabase.from("blocker_ages").select("*").eq("project_id", project_id),
      supabase.from("raid_entries").select("*, owner:people!raid_entries_owner_id_fkey(full_name), reporter:people!raid_entries_reporter_id_fkey(full_name), vendor:vendors(name)").eq("project_id", project_id),
      supabase.from("people").select("full_name, title, is_internal, vendor:vendors(name)").eq("org_id", orgId),
      supabase.from("vendors").select("name").eq("org_id", orgId).order("name"),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const actions = (actionsRes.data || []) as Row[];
    const blockers = (blockersRes.data || []) as Row[];
    const raidEntries = (raidRes.data || []) as Row[];
    const people = (peopleRes.data || []) as Row[];
    const vendors = (vendorsRes.data || []) as Row[];

    // Build context string
    const sections: string[] = [];

    sections.push(`PROJECT: ${project.name}
Health: ${project.health || "unknown"}
Description: ${project.description || "none"}
Notes: ${project.notes || "none"}
Initiative: ${(project.initiative as Row)?.name || "none"}`);

    if (vendors.length > 0) {
      sections.push(`VENDORS (${vendors.length}): ${vendors.map((v: Row) => v.name).join(", ")}`);
    }

    if (people.length > 0) {
      sections.push(`PEOPLE (${people.length}):\n${people.map((p: Row) => {
        const vendor = (p.vendor as Row)?.name;
        return `- ${p.full_name}${p.title ? ` (${p.title})` : ""} — ${p.is_internal ? "internal" : `vendor: ${vendor || "unknown"}`}`;
      }).join("\n")}`);
    }

    if (actions.length > 0) {
      sections.push(`ACTION ITEMS (${actions.length}):\n${actions.map((a: Row) =>
        `- [${a.priority}/${a.status}] ${a.title} | Owner: ${a.owner_name || "Unassigned"}${a.vendor_name ? ` | Vendor: ${a.vendor_name}` : ""}${a.due_date ? ` | Due: ${a.due_date}` : ""}${a.age_days != null ? ` | Age: ${a.age_days}d` : ""}${a.stage ? ` | Stage: ${a.stage}` : ""}`
      ).join("\n")}`);
    }

    if (blockers.length > 0) {
      sections.push(`BLOCKERS (${blockers.length}):\n${blockers.map((b: Row) =>
        `- [${b.priority}/${b.status}] ${b.title} | Owner: ${b.owner_name || "Unassigned"}${b.vendor_name ? ` | Vendor: ${b.vendor_name}` : ""}${b.age_days != null ? ` | Age: ${b.age_days}d` : ""}`
      ).join("\n")}`);
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

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/* ── AI prompt: only used for overview, stakeholders, vendor summary ── */

const SYSTEM_PROMPT = `You are a project documentation writer. You will receive structured project data and must produce THREE sections as markdown. Do not produce any other sections.

CRITICAL: Only state facts present in the data. Never invent, assume, or editorialize.

Return JSON: { "sections": [ { "key": string, "title": string, "content": string }, ... ] }

Sections to generate:

1. key: "overview", title: "Project Overview"
   Write 2-4 sentences covering: project name, what it is (from description/notes), current health status, which initiative it belongs to, and which vendors are involved.
   If description or notes say "none", do not mention them.

2. key: "stakeholders", title: "Stakeholders & Team"
   Group the PEOPLE list into "Internal Team" and "Vendor Contacts" (grouped by vendor name).
   Use bullet points: "- **Name** — Title" (or just "- **Name**" if no title).
   Only include people provided in the data. Do not add anyone.

3. key: "vendor_summary", title: "Vendor Summary"
   For each vendor, write 1-2 sentences summarizing their involvement using the VENDOR STATS provided.
   Example: "**Silk Commerce** has 2 open action items and 3 open issues assigned to them."
   Only include vendors that appear in the data.

Do NOT generate sections for action items, blockers, risks, issues, decisions, or assumptions — those are handled separately.`;

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
    const [projectRes, actionsOpenRes, actionsClosedRes, blockersOpenRes, blockersClosedRes, raidRes, raidResolvedRes, pvRes] = await Promise.all([
      supabase.from("projects").select("*, initiative:initiatives(name)").eq("id", project_id).single(),
      supabase.from("action_item_ages").select("*, owner:people!action_items_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("action_items").select("id").eq("project_id", project_id).eq("status", "complete"),
      supabase.from("blocker_ages").select("*, owner:people!blockers_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("blockers").select("id").eq("project_id", project_id).not("resolved_at", "is", null),
      supabase.from("raid_entries").select("*, owner:people!raid_entries_owner_id_fkey(id, full_name, title, is_internal, vendor_id), reporter:people!raid_entries_reporter_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id).is("resolved_at", null),
      supabase.from("raid_entries").select("id, raid_type").eq("project_id", project_id).not("resolved_at", "is", null),
      supabase.from("project_vendors").select("vendor:vendors(id, name)").eq("project_id", project_id),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const actionsOpen = (actionsOpenRes.data || []) as Row[];
    const actionsClosedCount = (actionsClosedRes.data || []).length;
    const blockersOpen = (blockersOpenRes.data || []) as Row[];
    const blockersClosedCount = (blockersClosedRes.data || []).length;
    const raidOpen = (raidRes.data || []) as Row[];
    const raidResolved = (raidResolvedRes.data || []) as Row[];

    // Collect people IDs referenced in this project
    const referencedPersonIds = new Set<string>();
    actionsOpen.forEach((a: Row) => { if ((a.owner as Row)?.id) referencedPersonIds.add((a.owner as Row).id); });
    blockersOpen.forEach((b: Row) => { if ((b.owner as Row)?.id) referencedPersonIds.add((b.owner as Row).id); });
    raidOpen.forEach((r: Row) => {
      if ((r.owner as Row)?.id) referencedPersonIds.add((r.owner as Row).id);
      if ((r.reporter as Row)?.id) referencedPersonIds.add((r.reporter as Row).id);
    });

    // Fetch referenced people
    let people: Row[] = [];
    if (referencedPersonIds.size > 0) {
      const { data } = await supabase
        .from("people")
        .select("full_name, title, is_internal, vendor:vendors(name)")
        .in("id", Array.from(referencedPersonIds));
      people = (data || []) as Row[];
    }

    const projectVendors = ((pvRes.data || []) as Row[]).map((pv: Row) => pv.vendor).filter(Boolean);

    // ── Build server-side sections (no AI needed) ──

    const codeSections: { key: string; title: string; content: string }[] = [];

    // Status Summary — built in code, guaranteed accurate
    const risks = raidOpen.filter((r: Row) => r.raid_type === "risk");
    const issues = raidOpen.filter((r: Row) => r.raid_type === "issue");
    const decisions = raidOpen.filter((r: Row) => r.raid_type === "decision");
    const assumptions = raidOpen.filter((r: Row) => r.raid_type === "assumption");
    const risksResolved = raidResolved.filter((r: Row) => r.raid_type === "risk").length;
    const issuesResolved = raidResolved.filter((r: Row) => r.raid_type === "issue").length;
    const decisionsResolved = raidResolved.filter((r: Row) => r.raid_type === "decision").length;
    const assumptionsResolved = raidResolved.filter((r: Row) => r.raid_type === "assumption").length;

    let summary = "| Category | Open | Completed | Total |\n|----------|------|-----------|-------|\n";
    summary += `| Action Items | ${actionsOpen.length} | ${actionsClosedCount} | ${actionsOpen.length + actionsClosedCount} |\n`;
    summary += `| Blockers | ${blockersOpen.length} | ${blockersClosedCount} | ${blockersOpen.length + blockersClosedCount} |\n`;
    summary += `| Risks | ${risks.length} | ${risksResolved} | ${risks.length + risksResolved} |\n`;
    summary += `| Issues | ${issues.length} | ${issuesResolved} | ${issues.length + issuesResolved} |\n`;
    summary += `| Decisions | ${decisions.length} | ${decisionsResolved} | ${decisions.length + decisionsResolved} |\n`;
    summary += `| Assumptions | ${assumptions.length} | ${assumptionsResolved} | ${assumptions.length + assumptionsResolved} |`;

    codeSections.push({ key: "status_summary", title: "Status Summary", content: summary });

    // ── Build AI context (only for overview, stakeholders, vendor summary) ──

    const aiContext: string[] = [];

    aiContext.push(`PROJECT: ${project.name}
Health: ${project.health || "unknown"}
Description: ${project.description || "none"}
Notes: ${project.notes || "none"}
Initiative: ${(project.initiative as Row)?.name || "none"}`);

    if (projectVendors.length > 0) {
      aiContext.push(`VENDORS: ${projectVendors.map((v: Row) => v.name).join(", ")}`);
    }

    if (people.length > 0) {
      aiContext.push(`PEOPLE:\n${people.map((p: Row) => {
        const vendor = (p.vendor as Row)?.name;
        return `- ${p.full_name}${p.title ? ` (${p.title})` : ""} — ${p.is_internal ? "internal" : `vendor: ${vendor || "unknown"}`}`;
      }).join("\n")}`);
    }

    // Vendor stats for AI vendor summary
    const vendorStats: Record<string, { actions: number; blockers: number; risks: number; issues: number }> = {};
    for (const v of projectVendors) {
      vendorStats[v.name] = { actions: 0, blockers: 0, risks: 0, issues: 0 };
    }
    actionsOpen.forEach((a: Row) => {
      const vName = (a.vendor as Row)?.name;
      if (vName && vendorStats[vName]) vendorStats[vName].actions++;
    });
    blockersOpen.forEach((b: Row) => {
      const vName = (b.vendor as Row)?.name;
      if (vName && vendorStats[vName]) vendorStats[vName].blockers++;
    });
    raidOpen.forEach((r: Row) => {
      const vName = (r.vendor as Row)?.name;
      if (vName && vendorStats[vName]) {
        if (r.raid_type === "risk") vendorStats[vName].risks++;
        if (r.raid_type === "issue") vendorStats[vName].issues++;
      }
    });

    if (Object.keys(vendorStats).length > 0) {
      aiContext.push(`VENDOR STATS:\n${Object.entries(vendorStats).map(([name, s]) =>
        `- ${name}: ${s.actions} open action items, ${s.blockers} open blockers, ${s.risks} open risks, ${s.issues} open issues`
      ).join("\n")}`);
    }

    // Call AI for overview, stakeholders, vendor summary only
    const result = await callDeepSeek<{ sections: { key: string; title: string; content: string }[] }>({
      system: SYSTEM_PROMPT,
      user: aiContext.join("\n\n"),
      maxTokens: 2000,
      temperature: 0,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const aiSections = result.data.sections || [];

    // ── Assemble final doc: AI sections first, then code sections ──

    const allSections: { key: string; title: string; content: string }[] = [];

    // Insert AI sections in order: overview, stakeholders
    const overview = aiSections.find((s) => s.key === "overview");
    if (overview) allSections.push(overview);

    const stakeholders = aiSections.find((s) => s.key === "stakeholders");
    if (stakeholders) allSections.push(stakeholders);

    // Status summary (code-generated)
    allSections.push(...codeSections);

    // Vendor summary (AI)
    const vendorSummary = aiSections.find((s) => s.key === "vendor_summary");
    if (vendorSummary) allSections.push(vendorSummary);

    const now = new Date().toISOString();

    // Delete existing docs, insert new
    await supabase.from("project_documents").delete().eq("project_id", project_id);

    if (allSections.length > 0) {
      const rows = allSections.map((s, i) => ({
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

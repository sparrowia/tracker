import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const SYSTEM_PROMPT = `You are a senior project manager writing internal project documentation. You receive structured project data and must produce a useful, narrative document that helps someone quickly understand the state and context of this project.

CRITICAL RULES:
- ONLY state facts explicitly present in the data. Never invent information.
- Copy names, statuses, dates exactly as they appear. If someone is listed as the owner, name them.
- Write in a professional but readable tone — this is a living reference document, not a formal report.

Return JSON: { "sections": [ { "key": string, "title": string, "content": string }, ... ] }

Generate these sections in order. Use markdown formatting (headers, bold, bullets, etc). Skip a section only if there is truly zero relevant data for it.

1. key: "overview", title: "Project Overview"
   Write a paragraph covering what this project is, its current health status, which initiative it falls under, and the overall scope. Mention which vendors are involved and in what capacity. Use the project description, notes, and vendor list to paint a complete picture. If there are no notes or description, focus on what can be inferred from the project name, vendors, and item data.

2. key: "stakeholders", title: "Stakeholders & Team"
   Organize into **Internal Team** and **Vendor Contacts** (grouped by vendor name).
   Format: "- **Name** — Title" (omit title if not available).
   Only include people from the PEOPLE data. Do not add anyone.

3. key: "current_state", title: "Current State & Progress"
   Write 2-3 paragraphs assessing where the project stands right now. Reference the STATUS COUNTS to frame progress (e.g. "Of the 6 action items created, 2 have been completed with 4 still open"). Call out:
   - What's actively being worked on (in_progress items)
   - What's overdue or aging (items with high age)
   - Any items needing verification
   - The balance between open and completed work
   Use specific item titles and owner names to make this concrete, not generic.

4. key: "risks_and_issues", title: "Risks & Issues"
   Write a narrative summary of the risk and issue landscape. For each open risk and issue, describe what it is, who owns it, its priority, and current status. Group by priority (critical/high first). If there are resolved risks or issues, mention them briefly as context. Do NOT just make a table — write about what these risks/issues mean for the project.

5. key: "decisions", title: "Key Decisions"
   For each decision, describe what was decided (or what's pending), who owns it, and the date if available. Distinguish between final and pending decisions. If no decisions exist, skip this section.

6. key: "vendor_summary", title: "Vendor Summary"
   For each vendor involved in the project, write a paragraph covering:
   - What they're responsible for (infer from their assigned items)
   - How many open items they have (from VENDOR STATS)
   - Any notable risks, blockers, or issues assigned to them
   - Key contacts at that vendor (from PEOPLE data)
   Only include vendors that appear in the data.`;

function fmtOwner(row: Row, field = "owner"): string {
  return (row[field] as Row)?.full_name || "Unassigned";
}

function fmtVendor(row: Row): string | null {
  return (row.vendor as Row)?.name || null;
}

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
    const [projectRes, actionsOpenRes, actionsClosedRes, blockersOpenRes, blockersClosedRes, raidOpenRes, raidResolvedRes, pvRes] = await Promise.all([
      supabase.from("projects").select("*, initiative:initiatives(name)").eq("id", project_id).single(),
      supabase.from("action_item_ages").select("*, owner:people!action_items_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("action_items").select("id, title, owner:people!action_items_owner_id_fkey(full_name)").eq("project_id", project_id).eq("status", "complete"),
      supabase.from("blocker_ages").select("*, owner:people!blockers_owner_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id),
      supabase.from("blockers").select("id, title, owner:people!blockers_owner_id_fkey(full_name)").eq("project_id", project_id).not("resolved_at", "is", null),
      supabase.from("raid_entries").select("*, owner:people!raid_entries_owner_id_fkey(id, full_name, title, is_internal, vendor_id), reporter:people!raid_entries_reporter_id_fkey(id, full_name), vendor:vendors(id, name)").eq("project_id", project_id).is("resolved_at", null),
      supabase.from("raid_entries").select("id, raid_type, title, owner:people!raid_entries_owner_id_fkey(full_name)").eq("project_id", project_id).not("resolved_at", "is", null),
      supabase.from("project_vendors").select("vendor:vendors(id, name)").eq("project_id", project_id),
    ]);

    const project = projectRes.data;
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const actionsOpen = (actionsOpenRes.data || []) as Row[];
    const actionsClosed = (actionsClosedRes.data || []) as Row[];
    const blockersOpen = (blockersOpenRes.data || []) as Row[];
    const blockersClosed = (blockersClosedRes.data || []) as Row[];
    const raidOpen = (raidOpenRes.data || []) as Row[];
    const raidResolved = (raidResolvedRes.data || []) as Row[];

    // Collect referenced people
    const referencedPersonIds = new Set<string>();
    actionsOpen.forEach((a: Row) => { if ((a.owner as Row)?.id) referencedPersonIds.add((a.owner as Row).id); });
    blockersOpen.forEach((b: Row) => { if ((b.owner as Row)?.id) referencedPersonIds.add((b.owner as Row).id); });
    raidOpen.forEach((r: Row) => {
      if ((r.owner as Row)?.id) referencedPersonIds.add((r.owner as Row).id);
      if ((r.reporter as Row)?.id) referencedPersonIds.add((r.reporter as Row).id);
    });

    let people: Row[] = [];
    if (referencedPersonIds.size > 0) {
      const { data } = await supabase
        .from("people")
        .select("full_name, title, is_internal, vendor:vendors(name)")
        .in("id", Array.from(referencedPersonIds));
      people = (data || []) as Row[];
    }

    const projectVendors = ((pvRes.data || []) as Row[]).map((pv: Row) => pv.vendor).filter(Boolean);

    // ── Code-generated Status Summary ──

    const risks = raidOpen.filter((r: Row) => r.raid_type === "risk");
    const issues = raidOpen.filter((r: Row) => r.raid_type === "issue");
    const decisions = raidOpen.filter((r: Row) => r.raid_type === "decision");
    const assumptions = raidOpen.filter((r: Row) => r.raid_type === "assumption");
    const risksResolved = raidResolved.filter((r: Row) => r.raid_type === "risk");
    const issuesResolved = raidResolved.filter((r: Row) => r.raid_type === "issue");
    const decisionsResolved = raidResolved.filter((r: Row) => r.raid_type === "decision");
    const assumptionsResolved = raidResolved.filter((r: Row) => r.raid_type === "assumption");

    let statusTable = "| Category | Open | Completed | Total |\n|----------|------|-----------|-------|\n";
    statusTable += `| Action Items | ${actionsOpen.length} | ${actionsClosed.length} | ${actionsOpen.length + actionsClosed.length} |\n`;
    statusTable += `| Blockers | ${blockersOpen.length} | ${blockersClosed.length} | ${blockersOpen.length + blockersClosed.length} |\n`;
    statusTable += `| Risks | ${risks.length} | ${risksResolved.length} | ${risks.length + risksResolved.length} |\n`;
    statusTable += `| Issues | ${issues.length} | ${issuesResolved.length} | ${issues.length + issuesResolved.length} |\n`;
    statusTable += `| Decisions | ${decisions.length} | ${decisionsResolved.length} | ${decisions.length + decisionsResolved.length} |\n`;
    statusTable += `| Assumptions | ${assumptions.length} | ${assumptionsResolved.length} | ${assumptions.length + assumptionsResolved.length} |`;

    // ── Build data context for AI ──

    const ctx: string[] = [];

    ctx.push(`PROJECT: ${project.name}
Health: ${project.health || "unknown"}
Description: ${project.description || "none"}
Notes: ${project.notes || "none"}
Initiative: ${(project.initiative as Row)?.name || "none"}`);

    if (projectVendors.length > 0) {
      ctx.push(`VENDORS LINKED TO THIS PROJECT: ${projectVendors.map((v: Row) => v.name).join(", ")}`);
    }

    if (people.length > 0) {
      ctx.push(`PEOPLE INVOLVED:\n${people.map((p: Row) => {
        const vendor = (p.vendor as Row)?.name;
        return `- ${p.full_name}${p.title ? ` (${p.title})` : ""} — ${p.is_internal ? "internal" : `vendor: ${vendor || "unknown"}`}`;
      }).join("\n")}`);
    }

    // Status counts for AI context
    ctx.push(`STATUS COUNTS:
- Action Items: ${actionsOpen.length} open, ${actionsClosed.length} completed
- Blockers: ${blockersOpen.length} open, ${blockersClosed.length} resolved
- Risks: ${risks.length} open, ${risksResolved.length} resolved
- Issues: ${issues.length} open, ${issuesResolved.length} resolved
- Decisions: ${decisions.length} pending, ${decisionsResolved.length} final
- Assumptions: ${assumptions.length} open, ${assumptionsResolved.length} resolved`);

    // Full item data for narrative synthesis
    if (actionsOpen.length > 0) {
      ctx.push(`OPEN ACTION ITEMS:\n${actionsOpen.map((a: Row) =>
        `- "${a.title}" | Priority: ${a.priority} | Status: ${a.status} | Owner: ${fmtOwner(a)}${fmtVendor(a) ? ` | Vendor: ${fmtVendor(a)}` : ""}${a.due_date ? ` | Due: ${a.due_date}` : ""}${a.age_days != null ? ` | Age: ${a.age_days} days` : ""}${a.stage ? ` | Stage: ${a.stage}` : ""}`
      ).join("\n")}`);
    }
    if (actionsClosed.length > 0) {
      ctx.push(`COMPLETED ACTION ITEMS:\n${actionsClosed.map((a: Row) =>
        `- "${a.title}" | Owner: ${fmtOwner(a)}`
      ).join("\n")}`);
    }

    if (blockersOpen.length > 0) {
      ctx.push(`OPEN BLOCKERS:\n${blockersOpen.map((b: Row) =>
        `- "${b.title}" | Priority: ${b.priority} | Status: ${b.status} | Owner: ${fmtOwner(b)}${fmtVendor(b) ? ` | Vendor: ${fmtVendor(b)}` : ""}${b.age_days != null ? ` | Age: ${b.age_days} days` : ""}`
      ).join("\n")}`);
    }

    if (risks.length > 0) {
      ctx.push(`OPEN RISKS:\n${risks.map((r: Row) =>
        `- "${r.title}" | Priority: ${r.priority} | Status: ${r.status} | Owner: ${fmtOwner(r)}${fmtVendor(r) ? ` | Vendor: ${fmtVendor(r)}` : ""}${r.impact ? ` | Impact: ${r.impact}` : ""}${r.description ? ` | Description: ${r.description}` : ""}`
      ).join("\n")}`);
    }

    if (issues.length > 0) {
      ctx.push(`OPEN ISSUES:\n${issues.map((r: Row) =>
        `- "${r.title}" | Priority: ${r.priority} | Status: ${r.status} | Owner: ${fmtOwner(r)}${fmtVendor(r) ? ` | Vendor: ${fmtVendor(r)}` : ""}${r.stage ? ` | Stage: ${r.stage}` : ""}${r.description ? ` | Description: ${r.description}` : ""}`
      ).join("\n")}`);
    }

    if (decisions.length > 0) {
      ctx.push(`OPEN DECISIONS:\n${decisions.map((r: Row) =>
        `- "${r.title}" | Status: ${r.status === "complete" ? "Final" : "Pending"} | Owner: ${fmtOwner(r)}${r.decision_date ? ` | Date: ${r.decision_date}` : ""}${r.description ? ` | Description: ${r.description}` : ""}`
      ).join("\n")}`);
    }
    if (decisionsResolved.length > 0) {
      ctx.push(`FINALIZED DECISIONS:\n${decisionsResolved.map((r: Row) =>
        `- "${r.title}" | Owner: ${fmtOwner(r)}`
      ).join("\n")}`);
    }

    if (assumptions.length > 0) {
      ctx.push(`OPEN ASSUMPTIONS:\n${assumptions.map((r: Row) =>
        `- "${r.title}" | Priority: ${r.priority} | Status: ${r.status} | Owner: ${fmtOwner(r)}${r.description ? ` | Description: ${r.description}` : ""}`
      ).join("\n")}`);
    }

    // Pre-computed vendor stats
    const vendorStats: Record<string, { actions: number; blockers: number; risks: number; issues: number; contacts: string[] }> = {};
    for (const v of projectVendors) {
      vendorStats[v.name] = { actions: 0, blockers: 0, risks: 0, issues: 0, contacts: [] };
    }
    people.forEach((p: Row) => {
      if (!p.is_internal) {
        const vName = (p.vendor as Row)?.name;
        if (vName && vendorStats[vName]) vendorStats[vName].contacts.push(p.full_name);
      }
    });
    actionsOpen.forEach((a: Row) => { const v = fmtVendor(a); if (v && vendorStats[v]) vendorStats[v].actions++; });
    blockersOpen.forEach((b: Row) => { const v = fmtVendor(b); if (v && vendorStats[v]) vendorStats[v].blockers++; });
    raidOpen.forEach((r: Row) => {
      const v = fmtVendor(r);
      if (v && vendorStats[v]) {
        if (r.raid_type === "risk") vendorStats[v].risks++;
        if (r.raid_type === "issue") vendorStats[v].issues++;
      }
    });

    if (Object.keys(vendorStats).length > 0) {
      ctx.push(`VENDOR STATS:\n${Object.entries(vendorStats).map(([name, s]) =>
        `- ${name}: ${s.actions} open action items, ${s.blockers} open blockers, ${s.risks} open risks, ${s.issues} open issues | Contacts: ${s.contacts.length > 0 ? s.contacts.join(", ") : "none listed"}`
      ).join("\n")}`);
    }

    // ── Call AI ──

    const result = await callDeepSeek<{ sections: { key: string; title: string; content: string }[] }>({
      system: SYSTEM_PROMPT,
      user: ctx.join("\n\n"),
      maxTokens: 4000,
      temperature: 0,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const aiSections = result.data.sections || [];

    // ── Assemble final document ──

    const allSections: { key: string; title: string; content: string }[] = [];

    // AI: overview
    const overview = aiSections.find((s) => s.key === "overview");
    if (overview) allSections.push(overview);

    // AI: stakeholders
    const stakeholders = aiSections.find((s) => s.key === "stakeholders");
    if (stakeholders) allSections.push(stakeholders);

    // Code: status summary
    allSections.push({ key: "status_summary", title: "Status Summary", content: statusTable });

    // AI: current state
    const currentState = aiSections.find((s) => s.key === "current_state");
    if (currentState) allSections.push(currentState);

    // AI: risks & issues
    const risksIssues = aiSections.find((s) => s.key === "risks_and_issues");
    if (risksIssues) allSections.push(risksIssues);

    // AI: decisions
    const decisionsSection = aiSections.find((s) => s.key === "decisions");
    if (decisionsSection) allSections.push(decisionsSection);

    // AI: vendor summary
    const vendorSummary = aiSections.find((s) => s.key === "vendor_summary");
    if (vendorSummary) allSections.push(vendorSummary);

    const now = new Date().toISOString();

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

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a PM assistant that answers questions about project management data. You will be given a snapshot of all active items across the organization, then a user question.

Rules:
- Answer ONLY from the provided data — never invent or assume information
- Be concise and specific — use exact names, numbers, dates, and counts
- Use markdown: **bold** for names/emphasis, bullet points for lists
- Match names fuzzily (e.g. "Olga" matches "Olga Nagdaseva", "BP" matches "BenchPrep")
- If the data doesn't contain enough information to answer, say so clearly
- For counts, actually count the items — don't estimate
- When listing items, include their priority and status when relevant
- Keep answers brief — a few sentences or a short bulleted list

Return JSON: { "answer": "markdown string", "sources": ["which data categories you used"] }`;

function formatActionItems(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const owner = i.owner_name || "Unassigned";
    const vendor = i.vendor_name ? ` | ${i.vendor_name}` : "";
    const project = i.project_name ? ` | ${i.project_name}` : "";
    const due = i.due_date ? ` | due ${i.due_date}` : "";
    const age = i.age_days != null ? ` | ${i.age_days}d old` : "";
    return `- [${i.priority}/${i.status}] ${i.title} | owner: ${owner}${vendor}${project}${due}${age}`;
  });
  return `ACTION ITEMS (${items.length}):\n${lines.join("\n")}`;
}

function formatBlockers(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const owner = i.owner_name || "Unassigned";
    const vendor = i.vendor_name ? ` | ${i.vendor_name}` : "";
    const project = i.project_name ? ` | ${i.project_name}` : "";
    const age = i.age_days != null ? ` | ${i.age_days}d old` : "";
    return `- [${i.priority}/${i.status}] ${i.title} | owner: ${owner}${vendor}${project}${age}`;
  });
  return `BLOCKERS (${items.length}):\n${lines.join("\n")}`;
}

function formatRaid(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const owner = i.owner_name || "Unassigned";
    const vendor = i.vendor_name ? ` | ${i.vendor_name}` : "";
    const project = i.project_name ? ` | ${i.project_name}` : "";
    return `- [${i.raid_type}/${i.priority}/${i.status}] ${i.title} | owner: ${owner}${vendor}${project}`;
  });
  return `RAID ENTRIES (${items.length}):\n${lines.join("\n")}`;
}

function formatTickets(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const vendor = i.vendor_name ? ` | ${i.vendor_name}` : "";
    return `- [${i.priority}/${i.status}] #${i.ticket_number}: ${i.title || "(no title)"}${vendor}`;
  });
  return `SUPPORT TICKETS (${items.length}):\n${lines.join("\n")}`;
}

function formatProjects(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const init = i.initiative_name ? ` | initiative: ${i.initiative_name}` : "";
    return `- [${i.health}] ${i.name}${init}`;
  });
  return `PROJECTS (${items.length}):\n${lines.join("\n")}`;
}

function formatVendors(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  return `VENDORS (${items.length}): ${items.map((v) => v.name).join(", ")}`;
}

function formatPeople(items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const role = i.is_internal ? "internal" : "vendor contact";
    const vendor = i.vendor_name ? ` | ${i.vendor_name}` : "";
    return `- ${i.full_name} (${role}${vendor})`;
  });
  return `PEOPLE (${items.length}):\n${lines.join("\n")}`;
}

function formatResolved(label: string, items: Record<string, unknown>[]) {
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const resolved = i.resolved_at ? ` | resolved ${String(i.resolved_at).slice(0, 10)}` : "";
    return `- ${i.title}${resolved}`;
  });
  return `RECENTLY RESOLVED ${label} (${items.length}, last 30 days):\n${lines.join("\n")}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { question } = await request.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const orgId = profile.org_id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all data in parallel
    const [
      { data: actionItems },
      { data: blockers },
      { data: raidEntries },
      { data: tickets },
      { data: vendors },
      { data: projects },
      { data: people },
      { data: resolvedActions },
      { data: resolvedBlockers },
    ] = await Promise.all([
      supabase.from("action_item_ages").select("title, priority, status, due_date, age_days, owner_name, vendor_name, project_name").eq("org_id", orgId),
      supabase.from("blocker_ages").select("title, priority, status, age_days, owner_name, vendor_name, project_name").eq("org_id", orgId),
      supabase.from("raid_entries").select("title, raid_type, priority, status, owner:people(full_name), vendor:vendors(name), project:projects(name)").eq("org_id", orgId).neq("status", "complete"),
      supabase.from("support_tickets").select("ticket_number, title, priority, status, vendor:vendors(name)").eq("org_id", orgId).neq("status", "complete"),
      supabase.from("vendors").select("name").eq("org_id", orgId).order("name"),
      supabase.from("projects").select("name, health, initiative:initiatives(name)").eq("org_id", orgId).order("name"),
      supabase.from("people").select("full_name, is_internal, vendor:vendors(name)").eq("org_id", orgId).order("full_name"),
      supabase.from("action_items").select("title, resolved_at").eq("org_id", orgId).eq("status", "complete").gte("resolved_at", thirtyDaysAgo),
      supabase.from("blockers").select("title, resolved_at").eq("org_id", orgId).eq("status", "complete").gte("resolved_at", thirtyDaysAgo),
    ]);

    // Flatten joined fields for RAID, tickets, projects, people
    const flatRaid = (raidEntries || []).map((r: Record<string, unknown>) => ({
      ...r,
      owner_name: (r.owner as Record<string, unknown> | null)?.full_name || null,
      vendor_name: (r.vendor as Record<string, unknown> | null)?.name || null,
      project_name: (r.project as Record<string, unknown> | null)?.name || null,
    }));
    const flatTickets = (tickets || []).map((t: Record<string, unknown>) => ({
      ...t,
      vendor_name: (t.vendor as Record<string, unknown> | null)?.name || null,
    }));
    const flatProjects = (projects || []).map((p: Record<string, unknown>) => ({
      ...p,
      initiative_name: (p.initiative as Record<string, unknown> | null)?.name || null,
    }));
    const flatPeople = (people || []).map((p: Record<string, unknown>) => ({
      ...p,
      vendor_name: (p.vendor as Record<string, unknown> | null)?.name || null,
    }));

    // Build context
    const sections = [
      formatActionItems(actionItems || []),
      formatBlockers(blockers || []),
      formatRaid(flatRaid),
      formatTickets(flatTickets),
      formatProjects(flatProjects),
      formatVendors(vendors || []),
      formatPeople(flatPeople),
      formatResolved("ACTION ITEMS", resolvedActions || []),
      formatResolved("BLOCKERS", resolvedBlockers || []),
    ].filter(Boolean);

    const dataContext = sections.join("\n\n");

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `DATA:\n${dataContext}\n\nQUESTION: ${question}` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return NextResponse.json({ error: `API error: ${errBody}` }, { status: 502 });
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({
      answer: parsed.answer || "No answer generated.",
      sources: parsed.sources || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

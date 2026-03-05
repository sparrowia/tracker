import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { ASK_SYSTEM_PROMPT } from "@/lib/ai/prompts/ask";

type DataCategory = "actions" | "blockers" | "raid" | "tickets" | "projects" | "vendors" | "people" | "resolved";

/** Determine which data categories are relevant based on question keywords */
function detectCategories(q: string): Set<DataCategory> {
  const lq = q.toLowerCase();
  const cats = new Set<DataCategory>();

  if (/action\s*item|task|todo|assigned|owner|due|overdue|deliverable|follow.?up|pending|open items|work\s*item|responsible/.test(lq)) cats.add("actions");
  if (/blocker|block|stuck|impediment|holding|waiting\s+on|depend|delay/.test(lq)) cats.add("blockers");
  if (/raid|risk|assumption|issue|decision|pending decision|concern|escalat|threat|mitigat/.test(lq)) cats.add("raid");
  if (/ticket|support|case|help\s*desk/.test(lq)) cats.add("tickets");
  if (/project|health|initiative|status|progress|timeline|milestone|on\s*track/.test(lq)) cats.add("projects");
  if (/vendor|company|partner|supplier|contractor/.test(lq)) cats.add("vendors");
  if (/who|person|people|team|contact|assigned|owner|responsible|workload|capacity|most\s+task/.test(lq)) cats.add("people");
  if (/resolved|completed|done|closed|last week|recently|update|this week|changed|progress/.test(lq)) cats.add("resolved");

  // Questions about specific quantities or comparisons need both people and actions/blockers
  if (/how\s+many|most|least|count|total|number\s+of/.test(lq)) {
    cats.add("actions");
    cats.add("blockers");
    cats.add("people");
  }

  // "What should we" / priority questions need actions + blockers + raid
  if (/what\s+should|prioriti[sz]|urgent|focus|next|important|critical/.test(lq)) {
    cats.add("actions");
    cats.add("blockers");
    cats.add("raid");
  }

  if (cats.size === 0 || (cats.size === 1 && cats.has("people"))) {
    cats.add("actions");
    cats.add("blockers");
    cats.add("raid");
  }

  if (/everything|all\s|summary|overview|full\s+picture|brief|catch\s+me\s+up/.test(lq)) {
    cats.add("actions");
    cats.add("blockers");
    cats.add("raid");
    cats.add("tickets");
    cats.add("projects");
  }

  return cats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function formatActionItems(items: Row[]) {
  if (!items.length) return "";
  return `ACTION ITEMS (${items.length}):\n` + items.map((i) =>
    `- [${i.priority}/${i.status}] ${i.title} | ${i.owner_name || "Unassigned"}${i.vendor_name ? ` | ${i.vendor_name}` : ""}${i.project_name ? ` | ${i.project_name}` : ""}${i.due_date ? ` | due ${i.due_date}` : ""}${i.age_days != null ? ` | ${i.age_days}d` : ""}`
  ).join("\n");
}

function formatBlockers(items: Row[]) {
  if (!items.length) return "";
  return `BLOCKERS (${items.length}):\n` + items.map((i) =>
    `- [${i.priority}/${i.status}] ${i.title} | ${i.owner_name || "Unassigned"}${i.vendor_name ? ` | ${i.vendor_name}` : ""}${i.project_name ? ` | ${i.project_name}` : ""}${i.age_days != null ? ` | ${i.age_days}d` : ""}`
  ).join("\n");
}

function formatRaid(items: Row[]) {
  if (!items.length) return "";
  return `RAID ENTRIES (${items.length}):\n` + items.map((i) =>
    `- [${i.raid_type}/${i.priority}/${i.status}] ${i.title} | ${i.owner_name || "Unassigned"}${i.vendor_name ? ` | ${i.vendor_name}` : ""}${i.project_name ? ` | ${i.project_name}` : ""}`
  ).join("\n");
}

function formatTickets(items: Row[]) {
  if (!items.length) return "";
  return `SUPPORT TICKETS (${items.length}):\n` + items.map((i) =>
    `- [${i.priority}/${i.status}] #${i.ticket_number}: ${i.title || "(no title)"}${i.vendor_name ? ` | ${i.vendor_name}` : ""}`
  ).join("\n");
}

function formatProjects(items: Row[]) {
  if (!items.length) return "";
  return `PROJECTS (${items.length}):\n` + items.map((i) =>
    `- [${i.health}] ${i.name}${i.initiative_name ? ` | ${i.initiative_name}` : ""}`
  ).join("\n");
}

function formatVendors(items: Row[]) {
  if (!items.length) return "";
  return `VENDORS (${items.length}): ${items.map((v) => v.name).join(", ")}`;
}

function formatPeople(items: Row[]) {
  if (!items.length) return "";
  return `PEOPLE (${items.length}):\n` + items.map((i) =>
    `- ${i.full_name} (${i.is_internal ? "internal" : "vendor contact"}${i.vendor_name ? ` | ${i.vendor_name}` : ""})`
  ).join("\n");
}

function formatResolved(label: string, items: Row[]) {
  if (!items.length) return "";
  return `RECENTLY RESOLVED ${label} (${items.length}, last 30d):\n` + items.map((i) =>
    `- ${i.title}${i.resolved_at ? ` | resolved ${String(i.resolved_at).slice(0, 10)}` : ""}`
  ).join("\n");
}

function flatten(row: Row, joins: Record<string, string>): Row {
  const flat = { ...row };
  for (const [joinKey, field] of Object.entries(joins)) {
    flat[`${joinKey}_name`] = (row[joinKey] as Row | null)?.[field] || null;
    delete flat[joinKey];
  }
  return flat;
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

    const orgId = profile.org_id;
    const cats = detectCategories(question);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Only fetch what we need
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetches: Record<string, PromiseLike<{ data: any[] | null }>> = {};

    if (cats.has("actions"))
      fetches.actions = supabase.from("action_item_ages").select("title, priority, status, due_date, age_days, owner_name, vendor_name, project_name").eq("org_id", orgId);
    if (cats.has("blockers"))
      fetches.blockers = supabase.from("blocker_ages").select("title, priority, status, age_days, owner_name, vendor_name, project_name").eq("org_id", orgId);
    if (cats.has("raid"))
      fetches.raid = supabase.from("raid_entries").select("title, raid_type, priority, status, owner:people(full_name), vendor:vendors(name), project:projects(name)").eq("org_id", orgId).neq("status", "complete");
    if (cats.has("tickets"))
      fetches.tickets = supabase.from("support_tickets").select("ticket_number, title, priority, status, vendor:vendors(name)").eq("org_id", orgId).neq("status", "complete");
    if (cats.has("projects"))
      fetches.projects = supabase.from("projects").select("name, health, initiative:initiatives(name)").eq("org_id", orgId).order("name");
    if (cats.has("vendors"))
      fetches.vendors = supabase.from("vendors").select("name").eq("org_id", orgId).order("name");
    if (cats.has("people"))
      fetches.people = supabase.from("people").select("full_name, is_internal, vendor:vendors(name)").eq("org_id", orgId).order("full_name");
    if (cats.has("resolved")) {
      fetches.resolvedActions = supabase.from("action_items").select("title, resolved_at").eq("org_id", orgId).eq("status", "complete").gte("resolved_at", thirtyDaysAgo);
      fetches.resolvedBlockers = supabase.from("blockers").select("title, resolved_at").eq("org_id", orgId).eq("status", "complete").gte("resolved_at", thirtyDaysAgo);
    }

    const keys = Object.keys(fetches);
    const results = await Promise.all(Object.values(fetches));
    const data: Record<string, Row[]> = {};
    keys.forEach((k, i) => { data[k] = results[i].data || []; });

    const sections: string[] = [];
    if (data.actions) sections.push(formatActionItems(data.actions));
    if (data.blockers) sections.push(formatBlockers(data.blockers));
    if (data.raid) sections.push(formatRaid(data.raid.map((r) => flatten(r, { owner: "full_name", vendor: "name", project: "name" }))));
    if (data.tickets) sections.push(formatTickets(data.tickets.map((t) => flatten(t, { vendor: "name" }))));
    if (data.projects) sections.push(formatProjects(data.projects.map((p) => flatten(p, { initiative: "name" }))));
    if (data.vendors) sections.push(formatVendors(data.vendors));
    if (data.people) sections.push(formatPeople(data.people.map((p) => flatten(p, { vendor: "name" }))));
    if (data.resolvedActions) sections.push(formatResolved("ACTION ITEMS", data.resolvedActions));
    if (data.resolvedBlockers) sections.push(formatResolved("BLOCKERS", data.resolvedBlockers));

    const dataContext = sections.filter(Boolean).join("\n\n");

    const result = await callDeepSeek<{ answer: string; sources: string[] }>({
      system: ASK_SYSTEM_PROMPT,
      user: `DATA:\n${dataContext}\n\nQUESTION: ${question}`,
      maxTokens: 400,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      answer: result.data.answer || "No answer generated.",
      sources: result.data.sources || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

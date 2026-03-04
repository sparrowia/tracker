import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You answer questions about PM data. You receive relevant data then a question.

Rules:
- Answer ONLY from the data — never invent
- Be extremely brief — 1-3 short bullet points or 1-2 sentences max
- Use **bold** for names. Use bullet points for lists.
- Match names fuzzily ("Olga" = "Olga Nagdaseva", "BP" = "BenchPrep")
- For counts, count exactly
- Do NOT repeat the question or add filler ("Here is...", "Based on...")
- Go straight to the answer

Return JSON: { "answer": "markdown string", "sources": ["category names used"] }`;

type DataCategory = "actions" | "blockers" | "raid" | "tickets" | "projects" | "vendors" | "people" | "resolved";

/** Determine which data categories are relevant based on question keywords */
function detectCategories(q: string): Set<DataCategory> {
  const lq = q.toLowerCase();
  const cats = new Set<DataCategory>();

  // Keyword → category mapping
  if (/action\s*item|task|todo|assigned|owner|due|overdue/.test(lq)) cats.add("actions");
  if (/blocker|block|stuck|impediment/.test(lq)) cats.add("blockers");
  if (/raid|risk|assumption|issue|decision|pending decision/.test(lq)) cats.add("raid");
  if (/ticket|support|case/.test(lq)) cats.add("tickets");
  if (/project|health|initiative|status/.test(lq)) cats.add("projects");
  if (/vendor|company|partner/.test(lq)) cats.add("vendors");
  if (/who|person|people|team|contact|assigned|owner/.test(lq)) cats.add("people");
  if (/resolved|completed|done|closed|last week|recently|update/.test(lq)) cats.add("resolved");

  // Vendor/person names likely need broad search — if the question mentions a name
  // but no specific category, include the main item types
  if (cats.size === 0 || (cats.size === 1 && cats.has("people"))) {
    cats.add("actions");
    cats.add("blockers");
    cats.add("raid");
  }

  // "everything" / "all" / "summary" → all categories
  if (/everything|all\s|summary|overview/.test(lq)) {
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

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
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

    // Execute all in parallel
    const keys = Object.keys(fetches);
    const results = await Promise.all(Object.values(fetches));
    const data: Record<string, Row[]> = {};
    keys.forEach((k, i) => { data[k] = results[i].data || []; });

    // Build context — only include fetched categories
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
        max_tokens: 400,
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

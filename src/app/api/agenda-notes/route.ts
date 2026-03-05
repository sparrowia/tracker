import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a PM tool assistant. Given an existing project item and call notes from the user, determine what updates should be made to the item AND whether any new items should be created based on the notes.

Item types and their fields:

**agenda_item**: title, context (background info), ask (what's needed), priority
**blocker**: title, impact_description (what this blocks), description (details), priority, status, due_date
**action_item**: title, description (details), notes (additional context), priority, status, due_date

Priority values: critical, high, medium, low
Status values: pending, in_progress, complete, needs_verification, paused, at_risk, blocked

Return a JSON object with this structure:
{
  "updates": { ... fields to update on the CURRENT item ... },
  "new_items": [ ... new tasks/follow-ups mentioned in the notes ... ]
}

**updates** — ONLY the fields that should be updated. Omit any field that should remain unchanged. If nothing should change, use an empty object {}.

**new_items** — an array of new items that were mentioned in the notes. Each entry:
- "title" (required): concise action title
- "suggested_type" (required): one of "action_item", "blocker", "risk", "issue", "decision"
- "priority" (optional): critical, high, medium, low
- "description" (optional): brief context

If no new items, use an empty array [].

Rules for updates:
- NEVER change the title unless the notes explicitly say "rename this to..." or the user's wording clearly replaces the existing task's purpose
- Incorporate new information from the notes into the relevant text fields (append or revise, never lose important existing info)
- Update priority only if the notes explicitly indicate urgency changed
- Update status if the notes indicate progress (e.g. "they're working on it" → "in_progress", "waiting on them" → "blocked", "need to verify" → "needs_verification")
- If the notes say "due date moved/changed to X" or mention a new deadline → update "due_date" in YYYY-MM-DD format
- Be concise — keep field values brief and professional

Rules for new_items:
- If notes mention a new deliverable, follow-up, or task for someone → add to new_items
- If notes say "escalate to X" → create a new_item with title "Escalate [topic] to X" and suggested_type "action_item"
- If notes mention "send X to Y", "need to do Z", "follow up on W" → these are new action items
- If notes mention a new risk or concern → suggested_type "risk"
- If notes mention a decision was made → suggested_type "decision"
- Do NOT create a new_item for information that simply updates the current item

Return ONLY valid JSON, no other text`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { entity_type, current, notes } = await request.json();
    if (!notes?.trim()) {
      return NextResponse.json({ error: "No notes provided" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    // Build field listing from current values
    const fieldLines = Object.entries(current as Record<string, string>)
      .map(([key, val]) => `${key}: ${val || "(none)"}`)
      .join("\n");

    const userContent = `Current item (${entity_type}):
${fieldLines}

Call notes:
${notes}`;

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
          { role: "user", content: userContent },
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

    // Support both old format (flat updates) and new format ({ updates, new_items })
    const updates = parsed.updates || (parsed.new_items !== undefined ? {} : parsed);
    const new_items = Array.isArray(parsed.new_items) ? parsed.new_items : [];

    return NextResponse.json({ updates, new_items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

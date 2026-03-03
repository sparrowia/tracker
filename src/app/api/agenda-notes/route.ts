import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a PM tool assistant. Given an existing project item and call notes from the user, determine what updates should be made to the item based on the notes.

Item types and their fields:

**agenda_item**: title, context (background info), ask (what's needed), priority
**blocker**: title, impact_description (what this blocks), description (details), priority, status
**action_item**: title, description (details), notes (additional context), priority, status

Priority values: critical, high, medium, low
Status values: pending, in_progress, complete, needs_verification, paused, at_risk, blocked

Return a JSON object with ONLY the fields that should be updated based on the notes. Use the exact field names from the item type above. Omit any field that should remain unchanged.

Rules:
- Incorporate new information from the notes into the relevant text fields (append or revise, never lose important existing info)
- Update title only if the notes indicate the core issue has fundamentally changed
- Update priority only if the notes explicitly indicate urgency changed
- Update status if the notes indicate progress (e.g. "they're working on it" → "in_progress", "waiting on them" → "blocked", "need to verify" → "needs_verification")
- Be concise — keep field values brief and professional
- If the notes don't indicate any changes, return an empty object {}
- Return ONLY valid JSON, no other text`;

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

    let updates;
    try {
      updates = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json({ updates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

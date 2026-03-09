import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { CALL_NOTES_SYSTEM_PROMPT } from "@/lib/ai/prompts/call-notes";

export const maxDuration = 60;

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

    // Build field listing from current values
    const fieldLines = Object.entries(current as Record<string, string>)
      .map(([key, val]) => `${key}: ${val || "(none)"}`)
      .join("\n");

    const userContent = `Current item (${entity_type}):\n${fieldLines}\n\nCall notes:\n${notes}`;

    const result = await callDeepSeek<{ updates?: Record<string, unknown>; new_items?: unknown[] }>({
      system: CALL_NOTES_SYSTEM_PROMPT,
      user: userContent,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Support both old format (flat updates) and new format ({ updates, new_items })
    const updates = result.data.updates || (result.data.new_items !== undefined ? {} : result.data);
    const new_items = Array.isArray(result.data.new_items) ? result.data.new_items : [];

    return NextResponse.json({ updates, new_items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

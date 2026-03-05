import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { fetchOrgContext, buildContextPrompt, buildTermCorrectionsPrompt } from "@/lib/ai/context";
import { EXTRACT_SYSTEM_PROMPT, SOURCE_HINTS, FEW_SHOT_EXAMPLE } from "@/lib/ai/prompts/extract";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { intake_id, raw_text, vendor_id, project_id } = await request.json();

    if (!raw_text || !intake_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Fetch org profile and intake source in parallel
    const [{ data: profile }, { data: intakeRecord }] = await Promise.all([
      supabase.from("profiles").select("org_id").eq("id", user.id).single(),
      supabase.from("intakes").select("source").eq("id", intake_id).single(),
    ]);

    const orgId = profile?.org_id;
    if (!orgId) {
      await supabase.from("intakes").update({ extraction_status: "failed" }).eq("id", intake_id);
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Fetch org context (vendor, project, people, term corrections)
    const ctx = await fetchOrgContext(supabase, orgId, vendor_id, project_id);

    // Build source-specific hints
    const source = (intakeRecord as { source?: string } | null)?.source || "manual";
    const sourceHint = SOURCE_HINTS[source] || SOURCE_HINTS.manual;

    // Compose full system prompt
    const fullPrompt =
      EXTRACT_SYSTEM_PROMPT +
      sourceHint +
      buildContextPrompt(ctx) +
      buildTermCorrectionsPrompt(ctx.termCorrections) +
      "\n\n" +
      FEW_SHOT_EXAMPLE;

    const result = await callDeepSeek({ system: fullPrompt, user: raw_text });

    if (!result.ok) {
      await supabase.from("intakes").update({ extraction_status: "failed" }).eq("id", intake_id);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Save extracted data to intake
    await supabase
      .from("intakes")
      .update({ extracted_data: result.data, extraction_status: "complete" })
      .eq("id", intake_id);

    return NextResponse.json({ success: true, data: result.data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { fetchOrgContext, buildContextPrompt, buildTermCorrectionsPrompt } from "@/lib/ai/context";
import { EXTRACT_SYSTEM_PROMPT, SOURCE_HINTS, FEW_SHOT_EXAMPLE } from "@/lib/ai/prompts/extract";

export const maxDuration = 300;

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
    let source = (intakeRecord as { source?: string } | null)?.source || "manual";

    // Auto-detect Asana export from content (in case source wasn't set correctly)
    if (source !== "asana" && /Printed from Asana/i.test(raw_text)) {
      source = "asana";
      await supabase.from("intakes").update({ source: "asana" }).eq("id", intake_id);
    }

    // Asana export: deterministic parser, skip DeepSeek entirely
    if (source === "asana") {
      const { parseAsanaExport } = await import("@/lib/parsers/asana");
      const extracted = parseAsanaExport(raw_text, ctx.peopleNames);
      await supabase
        .from("intakes")
        .update({ extracted_data: extracted, extraction_status: "complete" })
        .eq("id", intake_id);
      return NextResponse.json({ success: true, data: extracted });
    }

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

    // Post-process: validate and repair source_quotes
    const extracted = result.data as Record<string, { source_quote?: string }[]>;
    const lowerText = raw_text.toLowerCase();
    for (const items of Object.values(extracted)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item.source_quote) continue;
        // Check if quote exists verbatim
        if (raw_text.includes(item.source_quote)) continue;
        // Try case-insensitive match
        const lowerQuote = item.source_quote.toLowerCase();
        const ciIdx = lowerText.indexOf(lowerQuote);
        if (ciIdx !== -1) {
          // Replace with exact-case version from original text
          item.source_quote = raw_text.slice(ciIdx, ciIdx + item.source_quote.length);
          continue;
        }
        // Try sliding window: find best substring match using word overlap
        const quoteWords = lowerQuote.split(/\s+/).filter(Boolean);
        if (quoteWords.length < 3) { item.source_quote = null as unknown as string; continue; }
        let bestScore = 0;
        let bestStart = -1;
        let bestLen = 0;
        const textWords = raw_text.split(/\s+/);
        for (let start = 0; start < textWords.length; start++) {
          for (let len = Math.max(3, quoteWords.length - 2); len <= Math.min(textWords.length - start, quoteWords.length + 2); len++) {
            const windowWords = textWords.slice(start, start + len).map((w: string) => w.toLowerCase());
            const overlap = quoteWords.filter((w: string) => windowWords.includes(w)).length;
            const score = overlap / Math.max(quoteWords.length, windowWords.length);
            if (score > bestScore && score >= 0.6) {
              bestScore = score;
              bestStart = start;
              bestLen = len;
            }
          }
        }
        if (bestStart >= 0) {
          item.source_quote = textWords.slice(bestStart, bestStart + bestLen).join(" ");
        }
      }
    }

    // Save extracted data to intake
    await supabase
      .from("intakes")
      .update({ extracted_data: extracted, extraction_status: "complete" })
      .eq("id", intake_id);

    return NextResponse.json({ success: true, data: extracted });
  } catch (err) {
    // Mark intake as failed if we have an intake_id
    try {
      const body = await request.clone().json().catch(() => null);
      if (body?.intake_id) {
        const supabase = await createClient();
        await supabase.from("intakes").update({ extraction_status: "failed" }).eq("id", body.intake_id);
      }
    } catch { /* best-effort cleanup */ }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { notifyExtractionComplete } from "@/lib/slack";
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

    // Pre-process: extract Fathom ACTION ITEMs deterministically and compress transcript
    let processedText = raw_text;
    const preExtracted: { action_items: Record<string, unknown>[] } = { action_items: [] };

    // Detect Fathom/meeting transcript format (timestamps like "0:00 - Speaker Name")
    const isFathomTranscript = /^\d+:\d+\s*[-–—]\s*.+/m.test(raw_text);
    let skipFewShot = false;

    if (isFathomTranscript) {
      // Extract embedded ACTION ITEMs from Fathom deterministically
      const actionItemRegex = /^\s*ACTION ITEM:\s*(.+?)(?:\s*[-–—]\s*WATCH:.*)?$/gm;
      let match;
      while ((match = actionItemRegex.exec(raw_text)) !== null) {
        const title = match[1].trim().replace(/\s*[-–—]\s*WATCH:.*$/, "").trim();
        if (title) {
          preExtracted.action_items.push({
            title,
            priority: "medium",
            status: "pending",
            confidence: "high",
            source_quote: match[0].trim().slice(0, 80),
          });
        }
      }

      // Aggressively compress the transcript for AI processing
      processedText = processedText
        // Remove ACTION ITEM lines and WATCH URLs
        .replace(/^\s*ACTION ITEM:.*$/gm, "")
        .replace(/\s*[-–—]\s*WATCH:\s*https?:\/\/\S+/g, "")
        // Remove header / video URLs
        .replace(/^VIEW RECORDING.*$/gm, "")
        .replace(/https?:\/\/fathom\.video\S*/g, "")
        .replace(/https?:\/\/\S+/g, "") // Strip all remaining URLs
        // Remove "---" separator lines
        .replace(/^-{2,}\s*$/gm, "")
        // Collapse timestamp + speaker into compact format: "Speaker: text"
        .replace(/^\d+:\d+\s*[-–—]\s*(.+)\n/gm, "$1: ");

      // Remove excessive whitespace
      processedText = processedText.replace(/\n{3,}/g, "\n\n").replace(/  +/g, " ").trim();

      // Skip few-shot example for transcripts — the source hint is sufficient and saves ~500 tokens
      skipFewShot = true;
    }

    const sourceHint = SOURCE_HINTS[source] || SOURCE_HINTS.manual;

    // Compose full system prompt (skip few-shot example for transcripts to reduce token count)
    const today = new Date().toISOString().split("T")[0];
    const currentYear = new Date().getFullYear();
    const fullPrompt =
      EXTRACT_SYSTEM_PROMPT +
      `\n\nCRITICAL: Today's date is ${today}. The current year is ${currentYear}. All dates you generate MUST use ${currentYear} unless the text explicitly states a different year. NEVER use 2025.` +
      sourceHint +
      buildContextPrompt(ctx) +
      buildTermCorrectionsPrompt(ctx.termCorrections) +
      (skipFewShot ? "" : "\n\n" + FEW_SHOT_EXAMPLE);

    const result = await callDeepSeek({ system: fullPrompt, user: processedText });

    // Post-process: fix dates with wrong year (common AI mistake)
    if (result.ok) {
      const data = result.data as Record<string, Record<string, unknown>[]>;
      for (const items of Object.values(data)) {
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          for (const field of ["due_date", "decision_date", "date_reported"]) {
            const val = item[field] as string | null;
            if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
              const year = parseInt(val.slice(0, 4));
              // If the year is in the past and within 1 year of current, fix it
              if (year < currentYear && currentYear - year <= 2) {
                item[field] = `${currentYear}${val.slice(4)}`;
              }
            }
          }
        }
      }
    }

    if (!result.ok) {
      await supabase.from("intakes").update({ extraction_status: "failed" }).eq("id", intake_id);
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Merge pre-extracted Fathom items with AI results
    const extracted = result.data as Record<string, { source_quote?: string; title?: string }[]>;
    if (preExtracted.action_items.length > 0) {
      if (!extracted.action_items) extracted.action_items = [];
      // Add pre-extracted items, dedup by title
      const existingTitles = new Set(
        (extracted.action_items || []).map((i) => (i.title || "").toLowerCase().trim())
      );
      for (const item of preExtracted.action_items) {
        const title = ((item.title as string) || "").toLowerCase().trim();
        if (!existingTitles.has(title)) {
          extracted.action_items.push(item as { source_quote?: string; title?: string });
          existingTitles.add(title);
        }
      }
    }

    // Post-process: validate and repair source_quotes
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

    // Notify Slack (fire and forget)
    const counts: Record<string, number> = {};
    for (const [key, items] of Object.entries(extracted)) {
      if (Array.isArray(items)) counts[key] = items.length;
    }
    notifyExtractionComplete({ itemCounts: counts, intakeId: intake_id }).catch(() => {});

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

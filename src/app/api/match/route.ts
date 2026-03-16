import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";
import { MATCH_SYSTEM_PROMPT } from "@/lib/ai/prompts/match";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { intake_id, vendor_id, project_id } = await request.json();

    if (!intake_id) {
      return NextResponse.json({ error: "Missing intake_id" }, { status: 400 });
    }

    // Fetch intake and org in parallel
    const [{ data: intake }, { data: profile }] = await Promise.all([
      supabase.from("intakes").select("extracted_data, vendor_id, project_id").eq("id", intake_id).single(),
      supabase.from("profiles").select("org_id").eq("id", user.id).single(),
    ]);

    if (!intake?.extracted_data || !profile?.org_id) {
      return NextResponse.json({ matches: {} });
    }

    const orgId = profile.org_id;
    const scopeVendorId = vendor_id || intake.vendor_id || null;
    const scopeProjectId = project_id || intake.project_id || null;

    const extracted = intake.extracted_data as Record<string, { title?: string; subject?: string; notes?: string; impact?: string; impact_description?: string; rationale?: string; mitigation?: string; details?: string; new_status?: string }[]>;

    // Build queries — scope to vendor/project, include recently closed (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    function buildActionQuery() {
      let q = supabase.from("action_items").select("id, title, status, priority, project_id, project:projects(name)").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`status.neq.complete,updated_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    function buildBlockerQuery() {
      let q = supabase.from("blockers").select("id, title, status, priority, resolved_at, project_id, project:projects(name)").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`resolved_at.is.null,resolved_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    function buildRaidQuery() {
      let q = supabase.from("raid_entries").select("id, title, status, priority, raid_type, project_id, project:projects(name)").eq("org_id", orgId);
      if (scopeProjectId) q = q.eq("project_id", scopeProjectId);
      else if (scopeVendorId) q = q.eq("vendor_id", scopeVendorId);
      q = q.or(`status.neq.complete,updated_at.gte.${thirtyDaysAgo}`);
      return q;
    }

    const [{ data: actions }, { data: blockers }, { data: raids }] = await Promise.all([
      buildActionQuery(),
      buildBlockerQuery(),
      buildRaidQuery(),
    ]);

    // Build extracted items text — including status_updates
    const extractedLines: string[] = [];
    const categories = ["action_items", "decisions", "issues", "risks", "blockers", "status_updates"] as const;
    for (const cat of categories) {
      const items = extracted[cat] || [];
      items.forEach((item, idx) => {
        const key = `${cat}-${idx}`;
        const extra = item.notes || item.impact || item.impact_description || item.rationale || item.mitigation || item.details || "";
        const statusNote = item.new_status ? ` (status: ${item.new_status})` : "";
        extractedLines.push(`${key}: "${item.title || item.subject}"${statusNote}${extra ? ` [notes: ${extra}]` : ""}`);
      });
    }

    // Build existing items text and lookup map
    const existingLines: string[] = [];
    const existingMap = new Map<string, { title: string; status: string; priority: string; table: string; raid_type?: string; project_id?: string; project_name?: string }>();

    function projectName(item: { project?: { name: string } | { name: string }[] | null }): string | undefined {
      if (!item.project) return undefined;
      if (Array.isArray(item.project)) return item.project[0]?.name || undefined;
      return (item.project as { name: string }).name || undefined;
    }

    for (const a of (actions || [])) {
      const closed = a.status === "complete" ? " [CLOSED]" : "";
      existingLines.push(`[A] ${a.id}: "${a.title}" (${a.status}, ${a.priority})${closed}`);
      existingMap.set(a.id, { title: a.title, status: a.status, priority: a.priority, table: "action_items", project_id: a.project_id, project_name: projectName(a) });
    }
    for (const b of (blockers || [])) {
      const closed = b.resolved_at ? " [CLOSED]" : "";
      existingLines.push(`[B] ${b.id}: "${b.title}" (${b.status}, ${b.priority})${closed}`);
      existingMap.set(b.id, { title: b.title, status: b.status, priority: b.priority, table: "blockers", project_id: b.project_id, project_name: projectName(b) });
    }
    for (const r of (raids || [])) {
      const prefix = r.raid_type === "risk" ? "R" : r.raid_type === "issue" ? "I" : r.raid_type === "assumption" ? "AS" : "D";
      const closed = r.status === "complete" ? " [CLOSED]" : "";
      existingLines.push(`[${prefix}] ${r.id}: "${r.title}" (${r.status}, ${r.priority})${closed}`);
      existingMap.set(r.id, { title: r.title, status: r.status, priority: r.priority, table: "raid_entries", raid_type: r.raid_type, project_id: r.project_id, project_name: projectName(r) });
    }

    if (extractedLines.length === 0 || existingLines.length === 0) {
      return NextResponse.json({ matches: {} });
    }

    // --- Phase 1: Text-based matching (fast, reliable) ---
    const STOP_WORDS = new Set(["the", "a", "an", "to", "of", "in", "for", "on", "is", "it", "and", "or", "be", "do", "we", "us", "so", "if", "at", "by", "up", "as", "no", "not", "with", "that", "this", "from", "will", "can", "has", "have", "been", "are", "was", "were"]);

    function tokenize(text: string): string[] {
      return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
    }

    function wordOverlapScore(tokensA: string[], tokensB: string[]): number {
      if (tokensA.length === 0 || tokensB.length === 0) return 0;
      const setB = new Set(tokensB);
      const overlap = tokensA.filter((w) => setB.has(w)).length;
      return overlap / Math.max(tokensA.length, tokensB.length);
    }

    function substringMatch(extracted: string, existing: string): boolean {
      const eLower = extracted.toLowerCase();
      const xLower = existing.toLowerCase();
      // Check if any significant word from existing appears as a substring in extracted title
      const xWords = tokenize(existing).filter((w) => w.length >= 4);
      return xWords.some((w) => eLower.includes(w)) || xLower.includes(eLower.split(" ")[0] || "___");
    }

    type EnrichedMatch = { existing_id: string; existing_table: string; title: string; status: string; priority: string; raid_type?: string; project_name?: string; confidence: string; reason: string };
    const enriched: Record<string, EnrichedMatch[]> = {};
    const textMatchedKeys = new Set<string>();

    const existingEntries = Array.from(existingMap.entries());

    for (const cat of categories) {
      const items = extracted[cat] || [];
      items.forEach((item, idx) => {
        const key = `${cat}-${idx}`;
        const extractedTitle = (item.title || item.subject || "").trim();
        if (!extractedTitle) return;

        const extractedTokens = tokenize(extractedTitle);
        const extractedNotes = tokenize(item.notes || item.impact || item.impact_description || item.details || "");
        const allExtractedTokens = [...extractedTokens, ...extractedNotes];
        const candidates: EnrichedMatch[] = [];

        for (const [existingId, existing] of existingEntries) {
          const existingTokens = tokenize(existing.title);

          // Score: word overlap on title
          const titleScore = wordOverlapScore(extractedTokens, existingTokens);
          // Score: word overlap including notes
          const broadScore = wordOverlapScore(allExtractedTokens, existingTokens);
          // Substring match bonus
          const hasSubstring = substringMatch(extractedTitle, existing.title);

          const finalScore = Math.max(titleScore, broadScore * 0.8) + (hasSubstring ? 0.15 : 0);

          if (finalScore >= 0.25) {
            const fromDifferentProject = scopeProjectId && existing.project_id && existing.project_id !== scopeProjectId;
            const confidence = finalScore >= 0.5 ? "high" : "medium";
            const reason = titleScore >= 0.4 ? "title match"
              : hasSubstring ? "keyword match"
              : "related terms";

            candidates.push({
              existing_id: existingId,
              existing_table: existing.table,
              title: existing.title,
              status: existing.status,
              priority: existing.priority,
              raid_type: existing.raid_type,
              project_name: fromDifferentProject ? existing.project_name : undefined,
              confidence,
              reason,
            });
          }
        }

        // Sort by score (re-compute for sort), take top 3
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const scoreA = wordOverlapScore(extractedTokens, tokenize(a.title)) + (substringMatch(extractedTitle, a.title) ? 0.15 : 0);
            const scoreB = wordOverlapScore(extractedTokens, tokenize(b.title)) + (substringMatch(extractedTitle, b.title) ? 0.15 : 0);
            return scoreB - scoreA;
          });
          enriched[key] = candidates.slice(0, 3);
          textMatchedKeys.add(key);
        }
      });
    }

    // --- Phase 2: AI matching for remaining unmatched items (if any) ---
    const unmatchedLines = extractedLines.filter((line) => {
      const key = line.split(":")[0];
      return !textMatchedKeys.has(key);
    });

    if (unmatchedLines.length > 0 && existingLines.length > 0) {
      try {
        const scopeNote = scopeProjectId
          ? "Note: Items are scoped to the same project."
          : scopeVendorId ? "Note: Items are scoped to the same vendor." : "";

        const userContent = `${scopeNote ? scopeNote + "\n\n" : ""}NEWLY EXTRACTED:\n${unmatchedLines.join("\n")}\n\nEXISTING ITEMS:\n${existingLines.join("\n")}`;

        const result = await callDeepSeek<{ matches: Record<string, { existing_id: string; confidence: string; reason: string }[]> }>({
          system: MATCH_SYSTEM_PROMPT,
          user: userContent,
        });

        if (result.ok) {
          const rawMatches = result.data.matches || {};
          for (const [key, candidates] of Object.entries(rawMatches)) {
            if (enriched[key]) continue; // text match already found something
            const aiCandidates: EnrichedMatch[] = [];
            for (const c of candidates) {
              const existing = existingMap.get(c.existing_id);
              if (existing) {
                const fromDifferentProject = scopeProjectId && existing.project_id && existing.project_id !== scopeProjectId;
                aiCandidates.push({
                  existing_id: c.existing_id,
                  existing_table: existing.table,
                  title: existing.title,
                  status: existing.status,
                  priority: existing.priority,
                  raid_type: existing.raid_type,
                  project_name: fromDifferentProject ? existing.project_name : undefined,
                  confidence: c.confidence,
                  reason: c.reason,
                });
              }
            }
            if (aiCandidates.length > 0) {
              enriched[key] = aiCandidates;
            }
          }
        }
      } catch {
        // AI matching is supplementary — silently fail
      }
    }

    return NextResponse.json({ matches: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

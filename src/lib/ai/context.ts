/**
 * Shared org context builder for AI prompts.
 * Fetches vendor name, project name, people list, and term corrections.
 */
import { SupabaseClient } from "@supabase/supabase-js";

export interface OrgContext {
  orgId: string;
  vendorName: string | null;
  projectName: string | null;
  peopleNames: string[];
  termCorrections: { wrong_term: string; correct_term: string }[];
}

/**
 * Fetch org context for AI prompts.
 * All fetches run in parallel for performance.
 */
export async function fetchOrgContext(
  supabase: SupabaseClient,
  orgId: string,
  vendorId?: string | null,
  projectId?: string | null,
): Promise<OrgContext> {
  const [correctionsRes, vendorRes, projectRes, peopleRes] = await Promise.all([
    supabase.from("term_corrections").select("wrong_term, correct_term").eq("org_id", orgId),
    vendorId
      ? supabase.from("vendors").select("name").eq("id", vendorId).single()
      : Promise.resolve({ data: null }),
    projectId
      ? supabase.from("projects").select("name").eq("id", projectId).single()
      : Promise.resolve({ data: null }),
    supabase.from("people").select("full_name").eq("org_id", orgId).order("full_name"),
  ]);

  return {
    orgId,
    vendorName: (vendorRes.data as { name?: string } | null)?.name || null,
    projectName: (projectRes.data as { name?: string } | null)?.name || null,
    peopleNames: ((peopleRes.data || []) as { full_name: string }[]).map((p) => p.full_name),
    termCorrections: (correctionsRes.data || []) as { wrong_term: string; correct_term: string }[],
  };
}

/** Build the "Organization Context" section for any AI prompt. */
export function buildContextPrompt(ctx: OrgContext): string {
  const parts: string[] = [];

  if (ctx.vendorName) {
    parts.push(`Vendor context: This text is about vendor "${ctx.vendorName}". Items should be associated with this vendor.`);
  }
  if (ctx.projectName) {
    parts.push(`Project context: This text is about project "${ctx.projectName}". Items should be associated with this project.`);
  }
  if (ctx.peopleNames.length > 0) {
    parts.push(
      `Known People in this organization (use EXACT names from this list when you can match):\n${ctx.peopleNames.map((n) => `- ${n}`).join("\n")}`
    );
  }

  return parts.length > 0 ? `\n\n--- Organization Context ---\n${parts.join("\n\n")}` : "";
}

/** Build the term corrections prompt section. */
export function buildTermCorrectionsPrompt(corrections: { wrong_term: string; correct_term: string }[]): string {
  if (corrections.length === 0) return "";
  const lines = corrections.map((c) => `- "${c.wrong_term}" should be "${c.correct_term}"`);
  return `\n\nMANDATORY Term Corrections — you MUST replace these terms everywhere in your output (titles, owner_name, made_by, notes, details, etc.) but NOT in source_quote. Also correct obvious misspellings, phonetic variations, and alternate spellings of the same name/term (e.g. if "Shireen" → "Cheeren", then "Shereen", "Shirin", etc. should also become "Cheeren"). This overrides the "do not fabricate" rule — these corrections are authoritative:\n${lines.join("\n")}`;
}

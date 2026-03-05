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
      `Known People in this organization:\n${ctx.peopleNames.map((n) => `- ${n}`).join("\n")}\n\nWhen the text mentions someone, match to this list using full name, first name, or last name. Always output the FULL name from this list (e.g. if text says "Sarah" and the list has "Sarah Martinez", output "Sarah Martinez"). If no match, output the name as written.`
    );
  }

  return parts.length > 0 ? `\n\n--- Organization Context ---\n${parts.join("\n\n")}` : "";
}

/** Build the term corrections prompt section. */
export function buildTermCorrectionsPrompt(corrections: { wrong_term: string; correct_term: string }[]): string {
  if (corrections.length === 0) return "";
  const lines = corrections.map((c) => `- "${c.wrong_term}" should be "${c.correct_term}"`);
  return `\n\nMANDATORY Term Corrections — you MUST replace these exact terms everywhere in your output (titles, owner_name, made_by, notes, details, etc.) but NOT in source_quote. If you encounter a clear misspelling of one of these wrong terms (e.g. off by one letter), apply the same correction. Do NOT apply corrections to unrelated similar-sounding words:\n${lines.join("\n")}`;
}

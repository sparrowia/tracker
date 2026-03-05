import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an expert project management data extractor. Given raw text from Slack messages, emails, meeting notes, or transcripts, extract structured data.

Return a JSON object with these arrays (each can be empty):

{
  "action_items": [
    {
      "title": "Brief action description",
      "owner_name": "Person's full name or null",
      "priority": "critical|high|medium|low",
      "due_date": "YYYY-MM-DD or null",
      "notes": "Additional context",
      "source_quote": "Exact short phrase from the original text that this item was extracted from"
    }
  ],
  "decisions": [
    {
      "title": "Decision made",
      "rationale": "Why this was decided",
      "made_by": "Person's name or null",
      "decision_date": "YYYY-MM-DD or null",
      "source_quote": "Exact short phrase from the original text"
    }
  ],
  "issues": [
    {
      "title": "Issue description",
      "priority": "critical|high|medium|low",
      "impact": "What this affects",
      "owner_name": "Person responsible or null",
      "reporter_name": "Person who reported the issue or null",
      "date_reported": "YYYY-MM-DD or null",
      "attachments": "Screenshot/video URLs or references, or null",
      "notes": "Additional context or null",
      "updates": "Response/resolution/next-step info or null",
      "source_quote": "Exact short phrase from the original text"
    }
  ],
  "risks": [
    {
      "title": "Risk description",
      "priority": "critical|high|medium|low",
      "impact": "Potential impact",
      "mitigation": "Suggested mitigation or null",
      "source_quote": "Exact short phrase from the original text"
    }
  ],
  "blockers": [
    {
      "title": "What is blocked",
      "impact_description": "What this prevents",
      "owner_name": "Person responsible or null",
      "priority": "critical|high|medium|low",
      "source_quote": "Exact short phrase from the original text"
    }
  ],
  "status_updates": [
    {
      "subject": "What was updated",
      "new_status": "pending|in_progress|complete|needs_verification|paused|at_risk|blocked",
      "details": "Additional context",
      "source_quote": "Exact short phrase from the original text"
    }
  ]
}

Rules:
- Extract only what's explicitly stated or clearly implied
- Use full names when mentioned. When you can match a name to the Known People list, use the EXACT full name from that list
- Infer priority from language (urgent, ASAP, critical = high/critical; when possible = low)
- Dates should be in YYYY-MM-DD format
- Keep titles concise but descriptive
- Do not fabricate information not present in the text, EXCEPT for term corrections (see below) which MUST be applied
- source_quote MUST be a verbatim substring copied exactly from the input text (5-15 words). It will be used for text search, so it must match exactly. Do NOT apply term corrections to source_quote — it must match the original text
- Return ONLY valid JSON, no other text`;

const SOURCE_HINTS: Record<string, string> = {
  slack: `
Source format: Slack message
- @mentions (e.g. @john.smith) indicate people — match to Known People list by first/last name
- Messages may be from threads — treat the full thread as context
- Channel names may indicate the project or team
- Reactions and emoji don't carry actionable data — ignore them
- "FYI" or "heads up" messages are usually informational, not action items`,

  email: `
Source format: Email
- The sender (From:) is often the reporter or person raising the issue
- To/CC recipients may be responsible parties
- Subject line often summarizes the main topic
- Forwarded content (">") is background context, not new actions
- "Please" or "Can you" phrases directed at someone indicate action items for that person`,

  meeting_notes: `
Source format: Meeting notes
- Notes may reference multiple speakers — attribute actions to the person mentioned
- "We agreed" or "The team decided" = decisions
- "Next steps" or "follow-ups" sections contain action items
- Items marked with owners (e.g. "[John]" or "John to do X") should use that person as owner
- Distinguish between updates on existing work (status_updates) and new tasks (action_items)`,

  fathom_transcript: `
Source format: Fathom meeting transcript
- Format is typically "[Speaker Name] HH:MM:SS" followed by what they said
- Speaker names are the people in the meeting — match them to Known People
- When someone says "I'll do X" or "I can handle that", they are the owner of that action
- When someone says "Can you do X?" the person they're addressing is the owner
- Verbal commitments ("let's plan for", "we should", "I'll send") are action items
- Distinguish between discussion/context and actual commitments`,

  manual: `
Source format: Manual entry (free-form text)
- May be shorthand or abbreviated — use best judgment to expand into full items
- Names may be first-name only — match to Known People list`,
};

const FEW_SHOT_EXAMPLE = `
Here is an example showing how to extract from meeting notes:

INPUT:
"Met with Silk team today. Sarah confirmed the API migration is done — can close that out. John flagged that the SSO integration is blocked waiting on credentials from BenchPrep, been 2 weeks now. Need to escalate. Lisa mentioned there's a risk the Q2 deadline slips if we don't get the test environment by end of month. Decision: we'll use the staging server for UAT instead of waiting for prod. Matt to send the access credentials to Silk by Friday."

OUTPUT:
{
  "action_items": [
    {
      "title": "Send staging server access credentials to Silk",
      "owner_name": "Matt",
      "priority": "high",
      "due_date": null,
      "notes": "Due by Friday. Staging server to be used for UAT per team decision.",
      "source_quote": "Matt to send the access credentials to Silk by Friday"
    },
    {
      "title": "Escalate SSO credential request to BenchPrep",
      "owner_name": "John",
      "priority": "critical",
      "due_date": null,
      "notes": "Credentials have been pending for 2 weeks. Blocking SSO integration.",
      "source_quote": "SSO integration is blocked waiting on credentials from BenchPrep"
    }
  ],
  "decisions": [
    {
      "title": "Use staging server for UAT instead of waiting for production environment",
      "rationale": "Production environment not available in time; staging is sufficient for UAT.",
      "made_by": null,
      "decision_date": null,
      "source_quote": "we'll use the staging server for UAT instead of waiting for prod"
    }
  ],
  "issues": [],
  "risks": [
    {
      "title": "Q2 deadline may slip without test environment",
      "priority": "high",
      "impact": "Q2 delivery timeline at risk if test environment not available by end of month",
      "mitigation": "Using staging server for UAT (decided). Still need prod environment for final validation.",
      "source_quote": "risk the Q2 deadline slips if we don't get the test environment"
    }
  ],
  "blockers": [
    {
      "title": "SSO integration blocked — waiting on BenchPrep credentials",
      "impact_description": "Cannot proceed with SSO integration until credentials are provided",
      "owner_name": "John",
      "priority": "critical",
      "source_quote": "SSO integration is blocked waiting on credentials from BenchPrep"
    }
  ],
  "status_updates": [
    {
      "subject": "API migration",
      "new_status": "complete",
      "details": "Sarah confirmed the API migration is done.",
      "source_quote": "Sarah confirmed the API migration is done"
    }
  ]
}

Note how:
- "Matt to send X by Friday" becomes an action_item owned by Matt, NOT a status update
- "API migration is done" is a status_update (updating existing work), not an action item
- "Blocked waiting on credentials" is both a blocker AND triggers an escalation action item
- The decision captures the rationale and what was agreed
- source_quote is always a verbatim substring from the input
- Priorities are inferred: "blocked 2 weeks, need to escalate" = critical; "by Friday" = high`;

function buildContextSection(
  vendorName: string | null,
  projectName: string | null,
  peopleNames: string[],
): string {
  const parts: string[] = [];

  if (vendorName) {
    parts.push(`Vendor context: This text is about vendor "${vendorName}". Items should be associated with this vendor.`);
  }
  if (projectName) {
    parts.push(`Project context: This text is about project "${projectName}". Items should be associated with this project.`);
  }
  if (peopleNames.length > 0) {
    parts.push(
      `Known People in this organization (use EXACT names from this list when you can match):\n${peopleNames.map((n) => `- ${n}`).join("\n")}`
    );
  }

  return parts.length > 0 ? `\n\n--- Organization Context ---\n${parts.join("\n\n")}` : "";
}

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

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      await supabase
        .from("intakes")
        .update({ extraction_status: "failed" })
        .eq("id", intake_id);
      return NextResponse.json(
        { error: "Extraction API key not configured" },
        { status: 500 }
      );
    }

    // Fetch org profile, intake record (for source), and org context in parallel
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.org_id;

    // Parallel fetch: term corrections, vendor name, project name, people, intake source
    const [correctionsRes, vendorRes, projectRes, peopleRes, intakeRes] = await Promise.all([
      orgId
        ? supabase.from("term_corrections").select("wrong_term, correct_term").eq("org_id", orgId)
        : Promise.resolve({ data: null }),
      vendor_id
        ? supabase.from("vendors").select("name").eq("id", vendor_id).single()
        : Promise.resolve({ data: null }),
      project_id
        ? supabase.from("projects").select("name").eq("id", project_id).single()
        : Promise.resolve({ data: null }),
      orgId
        ? supabase.from("people").select("full_name").eq("org_id", orgId).order("full_name")
        : Promise.resolve({ data: null }),
      supabase.from("intakes").select("source").eq("id", intake_id).single(),
    ]);

    // Build term corrections prompt
    let termCorrectionsPrompt = "";
    const corrections = correctionsRes.data;
    if (corrections && corrections.length > 0) {
      const lines = corrections.map(
        (c: { wrong_term: string; correct_term: string }) =>
          `- "${c.wrong_term}" should be "${c.correct_term}"`
      );
      termCorrectionsPrompt = `\n\nMANDATORY Term Corrections — you MUST replace these terms everywhere in your output (titles, owner_name, made_by, notes, details, etc.) but NOT in source_quote. Also correct obvious misspellings, phonetic variations, and alternate spellings of the same name/term (e.g. if "Shireen" → "Cheeren", then "Shereen", "Shirin", etc. should also become "Cheeren"). This overrides the "do not fabricate" rule — these corrections are authoritative:\n${lines.join("\n")}`;
    }

    // Build source-specific hints
    const source = (intakeRes.data as { source?: string } | null)?.source || "manual";
    const sourceHint = SOURCE_HINTS[source] || SOURCE_HINTS.manual;

    // Build org context (vendor, project, people)
    const vendorName = (vendorRes.data as { name?: string } | null)?.name || null;
    const projectName = (projectRes.data as { name?: string } | null)?.name || null;
    const peopleNames = ((peopleRes.data || []) as { full_name: string }[]).map((p) => p.full_name);
    const contextSection = buildContextSection(vendorName, projectName, peopleNames);

    // Compose full system prompt
    const fullPrompt = SYSTEM_PROMPT + sourceHint + contextSection + termCorrectionsPrompt + "\n\n" + FEW_SHOT_EXAMPLE;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: fullPrompt },
          { role: "user", content: raw_text },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      await supabase
        .from("intakes")
        .update({ extraction_status: "failed" })
        .eq("id", intake_id);
      return NextResponse.json(
        { error: `Extraction API error: ${errBody}` },
        { status: 502 }
      );
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content;

    let extractedData;
    try {
      extractedData = JSON.parse(extractedText);
    } catch {
      await supabase
        .from("intakes")
        .update({ extraction_status: "failed" })
        .eq("id", intake_id);
      return NextResponse.json(
        { error: "Failed to parse extraction result" },
        { status: 500 }
      );
    }

    // Save extracted data to intake
    await supabase
      .from("intakes")
      .update({
        extracted_data: extractedData,
        extraction_status: "complete",
      })
      .eq("id", intake_id);

    return NextResponse.json({ success: true, data: extractedData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

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
- Use full names when mentioned
- Infer priority from language (urgent, ASAP, critical = high/critical; when possible = low)
- Dates should be in YYYY-MM-DD format
- Keep titles concise but descriptive
- Do not fabricate information not present in the text
- source_quote MUST be a verbatim substring copied exactly from the input text (5-15 words). It will be used for text search, so it must match exactly
- Return ONLY valid JSON, no other text`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { intake_id, raw_text } = await request.json();

    if (!raw_text || !intake_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      // Update intake status to failed
      await supabase
        .from("intakes")
        .update({ extraction_status: "failed" })
        .eq("id", intake_id);
      return NextResponse.json(
        { error: "Extraction API key not configured" },
        { status: 500 }
      );
    }

    // Fetch term corrections for this user's org
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    let termCorrectionsPrompt = "";
    if (profile?.org_id) {
      const { data: corrections } = await supabase
        .from("term_corrections")
        .select("wrong_term, correct_term")
        .eq("org_id", profile.org_id);

      if (corrections && corrections.length > 0) {
        const lines = corrections.map(
          (c: { wrong_term: string; correct_term: string }) =>
            `- "${c.wrong_term}" should be "${c.correct_term}"`
        );
        termCorrectionsPrompt = `\n\nTerm Corrections (apply these substitutions to names, products, and terms in your output):\n${lines.join("\n")}`;
      }
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + termCorrectionsPrompt },
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

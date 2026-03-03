import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type ItemType = "action_items" | "decisions" | "issues" | "risks" | "blockers" | "status_updates";

const TARGET_FIELDS: Record<ItemType, string[]> = {
  action_items: ["title", "owner_name", "priority", "due_date", "notes"],
  decisions: ["title", "made_by", "decision_date", "rationale"],
  issues: ["title", "owner_name", "priority", "date_reported", "impact", "attachments", "notes", "updates"],
  risks: ["title", "priority", "impact", "mitigation"],
  blockers: ["title", "owner_name", "priority", "impact_description"],
  status_updates: ["subject", "new_status", "details"],
};

const TYPE_LABELS: Record<ItemType, string> = {
  action_items: "Action Items",
  decisions: "Decisions",
  issues: "Issues",
  risks: "Risks",
  blockers: "Blockers",
  status_updates: "Status Updates",
};

interface Mapping {
  source_column: string;
  target_field: string | null;
  confidence: "high" | "medium" | "low";
}

interface SuggestResponse {
  suggested_type: ItemType;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  mappings: Mapping[];
}

// Keyword heuristic fallback when AI is unavailable
function fallbackMapping(headers: string[]): SuggestResponse {
  const lower = headers.map((h) => h.toLowerCase().trim());

  // Detect item type from header keywords
  let suggested_type: ItemType = "action_items";
  let confidence: "high" | "medium" | "low" = "low";

  if (lower.some((h) => h.includes("decision") || h.includes("rationale"))) {
    suggested_type = "decisions";
    confidence = "medium";
  } else if (lower.some((h) => h.includes("risk") || h.includes("mitigation"))) {
    suggested_type = "risks";
    confidence = "medium";
  } else if (lower.some((h) => h.includes("blocker") || h.includes("blocked"))) {
    suggested_type = "blockers";
    confidence = "medium";
  } else if (lower.some((h) => h.includes("status") && h.includes("update"))) {
    suggested_type = "status_updates";
    confidence = "medium";
  } else if (lower.some((h) => h.includes("issue"))) {
    suggested_type = "issues";
    confidence = "medium";
  } else if (lower.some((h) => h.includes("task") || h.includes("action") || h.includes("to do") || h.includes("todo"))) {
    suggested_type = "action_items";
    confidence = "medium";
  }

  const titleKeywords = ["title", "name", "task", "item", "description", "subject", "action", "summary", "what"];
  const ownerKeywords = ["owner", "assigned", "assignee", "responsible", "who", "person", "contact"];
  const priorityKeywords = ["priority", "urgency", "severity", "importance", "level"];
  const dateKeywords = ["due", "date", "deadline", "target", "by when", "when"];
  const notesKeywords = ["notes", "comment", "details", "context", "additional", "remarks"];
  const statusKeywords = ["status", "state", "progress", "stage"];
  const impactKeywords = ["impact", "effect", "consequence", "affected"];
  const rationaleKeywords = ["rationale", "reason", "why", "justification"];
  const mitigationKeywords = ["mitigation", "plan", "response", "counter"];

  const attachmentKeywords = ["screenshot", "video", "attachment", "media", "file", "image", "capture", "recording", "link"];
  const updatesKeywords = ["update", "response", "next step", "follow", "resolution", "reply"];
  const dateReportedKeywords = ["date reported", "reported", "opened", "created", "filed", "submitted"];

  const fieldKeywordMap: Record<string, string[]> = {
    title: titleKeywords,
    subject: titleKeywords,
    owner_name: ownerKeywords,
    made_by: ownerKeywords,
    priority: priorityKeywords,
    due_date: dateKeywords,
    decision_date: dateKeywords,
    date_reported: dateReportedKeywords,
    notes: notesKeywords,
    details: notesKeywords,
    new_status: statusKeywords,
    impact: impactKeywords,
    impact_description: impactKeywords,
    rationale: rationaleKeywords,
    mitigation: mitigationKeywords,
    attachments: attachmentKeywords,
    updates: updatesKeywords,
  };

  const availableFields = TARGET_FIELDS[suggested_type];
  const usedFields = new Set<string>();

  const mappings: Mapping[] = headers.map((header) => {
    const h = header.toLowerCase().trim();
    let bestField: string | null = null;
    let bestScore = 0;

    for (const field of availableFields) {
      if (usedFields.has(field)) continue;
      const keywords = fieldKeywordMap[field] || [];
      for (const kw of keywords) {
        if (h.includes(kw) || kw.includes(h)) {
          const score = kw.length;
          if (score > bestScore) {
            bestScore = score;
            bestField = field;
          }
        }
      }
    }

    if (bestField) {
      usedFields.add(bestField);
      return { source_column: header, target_field: bestField, confidence: "medium" as const };
    }

    return { source_column: header, target_field: null, confidence: "low" as const };
  });

  return {
    suggested_type,
    confidence,
    reasoning: "Mapped using keyword matching (AI unavailable)",
    mappings,
  };
}

const SYSTEM_PROMPT = `You are a data mapping expert. Given spreadsheet column headers and sample data rows, determine:
1. What type of project management items these rows represent
2. How each column maps to the target fields

Available item types and their fields:
${Object.entries(TARGET_FIELDS).map(([type, fields]) => `- ${TYPE_LABELS[type as ItemType]} (${type}): ${fields.join(", ")}`).join("\n")}

Return a JSON object:
{
  "suggested_type": "action_items|decisions|issues|risks|blockers|status_updates",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation of why this type was chosen",
  "mappings": [
    {
      "source_column": "Original column name",
      "target_field": "matching target field name or null if no match",
      "confidence": "high|medium|low"
    }
  ]
}

Rules:
- Every source column must appear in mappings (set target_field to null for columns that don't map)
- Each target_field can only be used once across all mappings, EXCEPT "notes" and "updates" which can have multiple columns mapped (they get concatenated as paragraphs)
- "title" (or "subject" for status_updates) is the most important field — always try to map it
- Look at sample data to help determine correct mappings, not just header names
- For issues: "date_reported" is for when the issue was filed/reported, "attachments" is for screenshot/video URLs or references, "notes" is for context/details, "updates" is for response/resolution/next-step columns
- Return ONLY valid JSON, no other text`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { headers, sample_rows } = await request.json();

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      // Fall back to heuristic mapping
      return NextResponse.json(fallbackMapping(headers));
    }

    const userContent = `Headers: ${JSON.stringify(headers)}\n\nSample rows (first 5):\n${JSON.stringify(sample_rows || [], null, 2)}`;

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
      // Fall back to heuristic
      return NextResponse.json(fallbackMapping(headers));
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content;

    try {
      const parsed = JSON.parse(text) as SuggestResponse;
      // Validate the response has required fields
      if (!parsed.suggested_type || !parsed.mappings) {
        return NextResponse.json(fallbackMapping(headers));
      }
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(fallbackMapping(headers));
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

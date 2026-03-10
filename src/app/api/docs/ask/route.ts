import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are a project documentation assistant. Answer questions ONLY from the provided documentation sections. If the answer is not in the documentation, say so — never invent information.

Rules:
- Be concise: 1-4 sentences or bullet points
- Use **bold** for key names, dates, statuses
- Reference which documentation section(s) your answer comes from
- If the question cannot be answered from the documentation, say "This is not covered in the current documentation."

Return JSON: { "answer": "markdown string", "sources": ["section titles used"] }`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { project_id, question } = await request.json();
    if (!project_id || !question?.trim()) {
      return NextResponse.json({ error: "Missing project_id or question" }, { status: 400 });
    }

    // Fetch all documentation for this project
    const { data: docs } = await supabase
      .from("project_documents")
      .select("section_title, content")
      .eq("project_id", project_id)
      .order("sort_order");

    if (!docs || docs.length === 0) {
      return NextResponse.json({
        answer: "No documentation has been generated yet. Click **Generate Documentation** to create it first.",
        sources: [],
      });
    }

    // Build documentation context
    const docContext = docs.map((d) => `## ${d.section_title}\n${d.content}`).join("\n\n---\n\n");

    const result = await callDeepSeek<{ answer: string; sources: string[] }>({
      system: SYSTEM_PROMPT,
      user: `DOCUMENTATION:\n${docContext}\n\nQUESTION: ${question}`,
      maxTokens: 500,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      answer: result.data.answer || "No answer generated.",
      sources: result.data.sources || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

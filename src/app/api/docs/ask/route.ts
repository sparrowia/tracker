import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { callDeepSeek } from "@/lib/ai/deepseek";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are a project documentation assistant. You answer questions ONLY using the provided documentation sections. Never invent or assume information beyond what is written.

Rules:
- Answer with as much detail as the documentation supports — use bullet points, lists, or short paragraphs as appropriate
- Use **bold** for names, dates, statuses, and key terms
- When the documentation contains tables, extract the relevant rows to answer the question
- If the answer is not in the documentation, respond: "This is not covered in the current documentation."
- Always cite which section(s) your answer comes from

Return JSON: { "answer": "markdown string", "sources": ["section title 1", "section title 2"] }`;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { project_id, question } = await request.json();
    if (!project_id || !question?.trim()) {
      return NextResponse.json({ error: "Missing project_id or question" }, { status: 400 });
    }

    // Fetch project name for context
    const [{ data: project }, { data: docs }] = await Promise.all([
      supabase.from("projects").select("name").eq("id", project_id).single(),
      supabase.from("project_documents").select("section_title, content").eq("project_id", project_id).order("sort_order"),
    ]);

    if (!docs || docs.length === 0) {
      return NextResponse.json({
        answer: "No documentation has been generated yet. Click **Generate Documentation** to create it first.",
        sources: [],
      });
    }

    const docContext = docs.map((d) => `## ${d.section_title}\n${d.content}`).join("\n\n---\n\n");
    const projectName = project?.name || "this project";

    const result = await callDeepSeek<{ answer: string; sources: string[] }>({
      system: SYSTEM_PROMPT,
      user: `Project: ${projectName}\n\nDOCUMENTATION:\n${docContext}\n\nQUESTION: ${question}`,
      maxTokens: 800,
      temperature: 0,
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

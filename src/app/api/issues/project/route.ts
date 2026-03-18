import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("name, slug, public_issue_form")
    .eq("slug", slug)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.public_issue_form) {
    return NextResponse.json({ error: "Form not available" }, { status: 403 });
  }

  return NextResponse.json({ name: project.name, slug: project.slug });
}

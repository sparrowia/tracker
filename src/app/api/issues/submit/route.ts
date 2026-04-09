import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewIssue } from "@/lib/slack";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      project_slug,
      reporter_name,
      title,
      description,
      issue_type,
      url,
      os,
      browser,
      attachment_urls,
    } = body;

    // Validate required fields
    if (!project_slug || !reporter_name?.trim() || !title?.trim() || !description?.trim() || !issue_type || !url?.trim() || !os || !browser) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Look up project by slug and check public_issue_form is enabled
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, org_id, name, public_issue_form")
      .eq("slug", project_slug)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.public_issue_form) {
      return NextResponse.json(
        { error: "Public issue form is not enabled for this project" },
        { status: 403 }
      );
    }

    // Generate display_id: find max I## for this project
    const { data: existingIssues } = await supabase
      .from("raid_entries")
      .select("display_id")
      .eq("project_id", project.id)
      .eq("raid_type", "issue");

    let maxNum = 0;
    if (existingIssues) {
      for (const e of existingIssues) {
        const num = parseInt(e.display_id.slice(1));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const displayId = `I${maxNum + 1}`;

    // Build formatted description with metadata
    const descParts: string[] = [];
    descParts.push(description.trim());
    descParts.push(""); // blank line
    descParts.push("---");
    descParts.push(`**Issue Type:** ${issue_type}`);
    descParts.push(`**OS:** ${os}`);
    descParts.push(`**Browser:** ${browser}`);
    descParts.push(`**Reporter:** ${reporter_name.trim()}`);

    if (attachment_urls && attachment_urls.length > 0) {
      descParts.push("");
      descParts.push("**Attachments:**");
      for (const fileUrl of attachment_urls) {
        descParts.push(`- ${fileUrl}`);
      }
    }

    const formattedDescription = descParts.join("\n");

    // Create the raid_entry
    const { data: entry, error: insertError } = await supabase
      .from("raid_entries")
      .insert({
        raid_type: "issue",
        title: title.trim(),
        description: formattedDescription,
        notes: url?.trim() ? url.trim() : null,
        priority: "medium",
        status: "pending",
        project_id: project.id,
        org_id: project.org_id,
        display_id: displayId,
        sort_order: 0,
        include_in_project_meeting: false,
        include_in_vendor_meeting: false,
        created_by: null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to create issue:", insertError);
      return NextResponse.json(
        { error: "Failed to submit issue" },
        { status: 500 }
      );
    }

    // Notify Slack — only for projects with a mapped channel
    const projectChannelMap: Record<string, string> = {
      "silk-uat": "#uat-unified-ce-platform",
    };
    const slackChannel = projectChannelMap[project_slug];
    if (slackChannel) {
      notifyNewIssue({
        projectName: project.name,
        title,
        issueType: issue_type,
        reporter: reporter_name,
        channel: slackChannel,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, id: entry.id });
  } catch (err) {
    console.error("Issue submission error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

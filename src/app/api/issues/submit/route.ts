import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewIssue } from "@/lib/slack";
import {
  ISSUE_TYPE_LABEL,
  FEATURE_REQUEST_TYPE,
  resolveIssueType,
} from "@/lib/issue-types";

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

    const resolvedType = resolveIssueType(issue_type);
    if (!resolvedType) {
      return NextResponse.json(
        { error: "Unrecognized issue type" },
        { status: 400 }
      );
    }
    const typeLabel = ISSUE_TYPE_LABEL[resolvedType];

    // A feature request is a proposal, not a defect, so it is filed as a
    // Decision (D##) rather than an Issue (I##) and shows up in the Decisions
    // section of the RAID log for a call to be made on it.
    const raidType = resolvedType === FEATURE_REQUEST_TYPE ? "decision" : "issue";
    const displayPrefix = raidType === "decision" ? "D" : "I";

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

    // Generate display_id: find max I## / D## for this project, numbered within
    // its own RAID section.
    const { data: existingOfType } = await supabase
      .from("raid_entries")
      .select("display_id")
      .eq("project_id", project.id)
      .eq("raid_type", raidType);

    let maxNum = 0;
    if (existingOfType) {
      for (const e of existingOfType) {
        const num = parseInt(e.display_id.slice(1));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const displayId = `${displayPrefix}${maxNum + 1}`;

    // Build formatted description with metadata
    const descParts: string[] = [];
    descParts.push(description.trim());
    descParts.push(""); // blank line
    descParts.push("---");
    descParts.push(`**Issue Type:** ${typeLabel}`);
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
        raid_type: raidType,
        issue_type: resolvedType,
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
        issueType: typeLabel,
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

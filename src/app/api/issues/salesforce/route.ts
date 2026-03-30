import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewIssue } from "@/lib/slack";

const API_KEY = process.env.SALESFORCE_API_KEY;

export async function POST(req: NextRequest) {
  try {
    // Auth: shared API key
    const providedKey = req.headers.get("x-api-key");
    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing API key" } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { case: sfCase, contact, project: projectSlug, submittedBy } = body;

    // Validate required fields
    if (!sfCase?.caseId || !sfCase?.subject || !projectSlug) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_FIELDS", message: "Required: case.caseId, case.subject, project" } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Check for duplicate — same Salesforce case already pushed
    const { data: existing } = await supabase
      .from("raid_entries")
      .select("id, display_id")
      .eq("sf_case_id", sfCase.caseId)
      .maybeSingle();

    if (existing) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DUPLICATE_CASE",
            message: `Case ${sfCase.caseNumber || sfCase.caseId} has already been submitted as issue ${existing.display_id}`,
          },
          issue: {
            id: existing.id,
            url: `${siteUrl}/projects/${projectSlug}?tab=raid`,
            number: existing.display_id,
          },
        },
        { status: 409 }
      );
    }

    // Look up project by slug
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, org_id, name, slug")
      .eq("slug", projectSlug)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: { code: "PROJECT_NOT_FOUND", message: `Project "${projectSlug}" not found` } },
        { status: 404 }
      );
    }

    // Map Salesforce priority to our priority
    const priorityMap: Record<string, string> = {
      Critical: "critical",
      High: "high",
      Medium: "medium",
      Low: "low",
    };
    const priority = priorityMap[sfCase.priority] || "medium";

    // Generate display_id
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

    // Build description with Salesforce metadata
    const descParts: string[] = [];
    if (sfCase.description) descParts.push(sfCase.description);
    descParts.push("");
    descParts.push("---");
    descParts.push(`**Source:** Salesforce Case ${sfCase.caseNumber || sfCase.caseId}`);
    if (sfCase.supportType) descParts.push(`**Support Type:** ${sfCase.supportType}`);
    if (sfCase.supportCategory) descParts.push(`**Category:** ${sfCase.supportCategory}`);
    if (sfCase.platform) descParts.push(`**Platform:** ${sfCase.platform}`);
    if (sfCase.issuePath) descParts.push(`**Issue Path:** ${sfCase.issuePath}`);
    if (sfCase.origin) descParts.push(`**Origin:** ${sfCase.origin}`);
    if (sfCase.type) descParts.push(`**Type:** ${sfCase.type}`);
    if (contact?.name) descParts.push(`**Contact:** ${contact.name}${contact.email ? ` (${contact.email})` : ""}`);
    if (submittedBy) descParts.push(`**Submitted by:** ${submittedBy}`);
    if (sfCase.caseUrl) descParts.push(`**Salesforce:** ${sfCase.caseUrl}`);

    const formattedDescription = descParts.join("\n");

    // Create the RAID entry
    const { data: entry, error: insertError } = await supabase
      .from("raid_entries")
      .insert({
        raid_type: "issue",
        title: sfCase.subject,
        description: formattedDescription,
        priority,
        status: "pending",
        project_id: project.id,
        org_id: project.org_id,
        display_id: displayId,
        sort_order: 0,
        include_in_project_meeting: false,
        include_in_vendor_meeting: false,
        created_by: null,
        sf_case_id: sfCase.caseId,
        sf_case_number: sfCase.caseNumber || null,
        sf_case_url: sfCase.caseUrl || null,
      })
      .select("id, display_id")
      .single();

    if (insertError) {
      console.error("Salesforce issue creation failed:", insertError);
      return NextResponse.json(
        { success: false, error: { code: "INSERT_FAILED", message: "Failed to create issue" } },
        { status: 500 }
      );
    }

    // Notify Slack
    const projectChannelMap: Record<string, string> = {
      "silk-uat": "#uat-unified-ce-platform",
    };
    const slackChannel = projectChannelMap[project.slug];
    if (slackChannel) {
      notifyNewIssue({
        projectName: project.name,
        title: sfCase.subject,
        issueType: sfCase.supportType || "Support Request",
        reporter: contact?.name || submittedBy || "Salesforce",
        channel: slackChannel,
      }).catch(() => {});
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

    return NextResponse.json({
      success: true,
      issue: {
        id: entry.id,
        url: `${siteUrl}/projects/${project.slug}?tab=raid`,
        number: entry.display_id,
      },
    });
  } catch (err) {
    console.error("Salesforce issue submission error:", err);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}

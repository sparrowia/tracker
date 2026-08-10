import { NextRequest, NextResponse } from "next/server";
import { runJiraSync } from "@/lib/jira-sync.mjs";

// The full board is ~6 Jira pages + 6 upsert chunks; comfortably under a
// minute, but not under the 15s default.
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Same guard as /api/notify/digest — Vercel cron sends the secret as a
  // bearer token, so only the scheduler (or someone holding the secret) can
  // trigger a sync.
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  if (!jiraEmail || !jiraToken) {
    return NextResponse.json({ error: "JIRA_EMAIL / JIRA_API_TOKEN not configured" }, { status: 500 });
  }

  try {
    const summary = await runJiraSync({
      jiraEmail,
      jiraToken,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      apply: true,
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_TEAM_ID = "T03U1QJMG";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user");
  if (!userId || !SLACK_BOT_TOKEN) {
    return NextResponse.json({ error: "Missing user or Slack config" }, { status: 400 });
  }

  const res = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });

  const data = await res.json();
  if (!data.ok || !data.channel?.id) {
    return NextResponse.json({ error: "Failed to open DM channel", detail: data.error }, { status: 502 });
  }

  // Return an HTML page that triggers the slack:// protocol from the client
  // Browser redirects to custom protocols don't work from server-side redirects
  // Use the web client URL — Slack will prompt to open in the desktop app
  const slackUrl = `https://app.slack.com/client/${SLACK_TEAM_ID}/${data.channel.id}`;
  return NextResponse.redirect(slackUrl);
}

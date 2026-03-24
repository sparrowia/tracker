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
  const slackUrl = `slack://channel?team=${SLACK_TEAM_ID}&id=${data.channel.id}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Opening Slack...</title></head><body><script>window.location.href=${JSON.stringify(slackUrl)};setTimeout(()=>window.close(),1000);</script></body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

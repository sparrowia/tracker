import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

const GREETINGS = [
  "🐾 *shuffles papers* Oh hi! I was just reorganizing your project tracker. Everything's fine. Probably.",
  "🐾 Hey there! I've been keeping an eye on things while you were gone. Well, one eye. The other one was on Slack.",
  "🐾 *adjusts tiny glasses* Ah yes, you've summoned Ed. How may I assist in your quest against overdue items?",
  "🐾 Welcome back! I missed you. Not in a weird way. In a project-management way.",
  "🐾 Oh good, you're here! I was starting to worry the blockers would stage a revolt.",
];

const MOTIVATIONS = [
  "💪 You've got this! Every completed task is a tiny victory dance waiting to happen.",
  "🌟 Remember: the best project managers aren't the ones with zero blockers — they're the ones who tackle them head-on. Like you!",
  "🚀 Progress isn't always linear, but you're still moving forward. That counts for a lot.",
  "🎯 Focus on one thing at a time. Even Ed can only chill by one river at a time. 🐾",
  "⭐ The fact that you're checking in means you care. That already puts you ahead.",
  "🏔️ Every mountain is climbed one step at a time. You're already on the trail.",
  "🌊 Be like Ed — stay calm, stay steady, and let the current carry you forward. 🐾",
  "🔥 You're doing more than you think. Take a breath and look at how far you've come.",
  "🎪 Juggling projects is hard. But you haven't dropped anything yet. Keep going!",
  "💡 The best time to start was yesterday. The second best time is right now. Go get it.",
  "🌱 Small progress is still progress. Water the seeds you've already planted.",
  "🏆 Nobody sees the behind-the-scenes grind. But Ed does. And Ed is impressed. 🐾",
  "☀️ New day, new chance to close out that one task that's been bugging you. You know the one.",
  "🎸 You're the project management rockstar your team didn't know they needed.",
  "🧠 Working smart > working hard. Take a step back, prioritize, then crush it.",
  "🐾 Ed believes in you. And Ed's judgment is impeccable. Just look at that face.",
  "🌈 Behind every resolved blocker is someone who refused to give up. That's you.",
  "⚡ Momentum builds. Knock out one small win and watch the rest follow.",
  "🎯 You don't have to finish everything today. Just move one thing forward.",
  "🫡 Your team is lucky to have someone who actually tracks things. Most people just wing it.",
];


function pick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const text = (formData.get("text") as string || "").trim().toLowerCase();
    const channelName = (formData.get("channel_name") as string || "").toLowerCase();

    // Simple commands that don't need DB
    if (!text || text === "hello" || text === "hi" || text === "hey") {
      return NextResponse.json({ response_type: "ephemeral", text: pick(GREETINGS) });
    }

    if (text === "motivate" || text === "inspire" || text === "encourage") {
      return NextResponse.json({ response_type: "ephemeral", text: pick(MOTIVATIONS) });
    }

    if (text === "help") {
      return NextResponse.json({
        response_type: "ephemeral",
        text: [
          "🐾 *Ed's Command Menu*",
          "",
          "`/ed` or `/ed hello` — Say hi to Ed",
          "`/ed status` — Live project stats (overdue, blockers, items)",
          "`/ed motivate` — Get an encouraging nudge",
          "`/ed help` — This menu",
          "",
          `<${SITE_URL}/dashboard|Open Dashboard>`,
        ].join("\n"),
      });
    }

    // Status command — pull live data, scoped to project if in a linked channel
    if (text === "status" || text === "stats" || text === "report") {
      const supabase = createAdminClient();
      const today = new Date().toISOString().split("T")[0];

      // Channel-to-project mapping
      const channelProjectMap: Record<string, string> = {
        "uat-unified-ce-platform": "silk-uat",
      };
      const projectSlug = channelProjectMap[channelName] || null;
      let projectId: string | null = null;
      let projectName: string | null = null;

      if (projectSlug) {
        const { data: proj } = await supabase.from("projects").select("id, name").eq("slug", projectSlug).single();
        if (proj) { projectId = proj.id; projectName = proj.name; }
      }

      // Build queries — optionally scoped to project
      // Match the UI: all non-complete statuses
      let overdueQ = supabase.from("action_items").select("*", { count: "exact", head: true })
        .lt("due_date", today).neq("status", "complete");
      let blockerQ = supabase.from("blockers").select("*", { count: "exact", head: true })
        .is("resolved_at", null);
      let actionQ = supabase.from("action_items").select("*", { count: "exact", head: true })
        .neq("status", "complete");
      let riskQ = supabase.from("raid_entries").select("*", { count: "exact", head: true })
        .in("raid_type", ["risk", "issue"]).not("status", "in", '("complete","closed","mitigated")');

      if (projectId) {
        overdueQ = overdueQ.eq("project_id", projectId);
        blockerQ = blockerQ.eq("project_id", projectId);
        actionQ = actionQ.eq("project_id", projectId);
        riskQ = riskQ.eq("project_id", projectId);
      }

      const [
        { count: overdueCount },
        { count: blockerCount },
        { count: openActionCount },
        { count: openRiskCount },
      ] = await Promise.all([overdueQ, blockerQ, actionQ, riskQ]);

      const overdue = overdueCount || 0;
      const blockers = blockerCount || 0;
      const actions = openActionCount || 0;
      const risks = openRiskCount || 0;

      let mood = "😊";
      if (overdue > 5 || blockers > 3) mood = "😰";
      else if (overdue > 0 || blockers > 0) mood = "😐";
      else mood = "🎉";

      const title = projectName ? `*${projectName} — Status Report*` : "*Project Health Report*";
      const dashboardLink = projectSlug ? `${SITE_URL}/projects/${projectSlug}` : `${SITE_URL}/dashboard`;

      const lines = [
        `${mood} ${title}`,
        "",
        `📋 *${actions}* open action items`,
        overdue > 0 ? `⚠️ *${overdue}* overdue` : "✅ Nothing overdue!",
        blockers > 0 ? `🚫 *${blockers}* active blockers` : "✅ No active blockers!",
        `⚡ *${risks}* open risks & issues`,
        "",
        overdue === 0 && blockers === 0
          ? "🐾 Looking good! Ed approves. 👍"
          : overdue > 5
            ? "🐾 Ed is concerned. Very concerned. Please check the dashboard."
            : "🐾 A few things need attention, but nothing Ed can't handle. Well, nothing *you* can't handle. Ed's just a capybara. A very chill one.",
        "",
        `<${dashboardLink}|${projectName ? `Open ${projectName}` : "Open Dashboard"}>`,
      ];

      return NextResponse.json({ response_type: "ephemeral", text: lines.join("\n") });
    }

    // Unknown command
    return NextResponse.json({
      response_type: "ephemeral",
      text: `🐾 Ed doesn't understand "${text}" yet. Try \`/ed help\` to see what I can do!`,
    });
  } catch (err) {
    console.error("Slack command error:", err);
    return NextResponse.json({
      response_type: "ephemeral",
      text: "🐾 Ed tripped over a watermelon. Something went wrong. Try again?",
    });
  }
}

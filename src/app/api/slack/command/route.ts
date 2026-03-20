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
];

const ROASTS = [
  "🔥 Let me check... yep, those items are still overdue. But at least you're consistent!",
  "🔥 You know what pairs well with overdue action items? Another meeting to discuss why they're overdue.",
  "🔥 I see you've adopted the 'if I don't look at the due dates, they can't hurt me' strategy. Bold move.",
  "🔥 Your blockers have blockers at this point. It's blockers all the way down.",
  "🔥 On the bright side, you can't be behind schedule if you never set a schedule. *taps forehead*",
];

function pick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const text = (formData.get("text") as string || "").trim().toLowerCase();

    // Simple commands that don't need DB
    if (!text || text === "hello" || text === "hi" || text === "hey") {
      return NextResponse.json({ response_type: "ephemeral", text: pick(GREETINGS) });
    }

    if (text === "motivate" || text === "inspire" || text === "encourage") {
      return NextResponse.json({ response_type: "ephemeral", text: pick(MOTIVATIONS) });
    }

    if (text === "roast" || text === "roast me") {
      return NextResponse.json({ response_type: "ephemeral", text: pick(ROASTS) });
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
          "`/ed roast` — Get roasted about your overdue items",
          "`/ed help` — This menu",
          "",
          `<${SITE_URL}/dashboard|Open Dashboard>`,
        ].join("\n"),
      });
    }

    // Status command — pull live data
    if (text === "status" || text === "stats" || text === "report") {
      const supabase = createAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const [
        { count: overdueCount },
        { count: blockerCount },
        { count: openActionCount },
        { count: openRiskCount },
      ] = await Promise.all([
        supabase.from("action_items").select("*", { count: "exact", head: true })
          .lt("due_date", today).in("status", ["pending", "in_progress", "at_risk", "blocked"]),
        supabase.from("blockers").select("*", { count: "exact", head: true })
          .is("resolved_at", null),
        supabase.from("action_items").select("*", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"]),
        supabase.from("raid_entries").select("*", { count: "exact", head: true })
          .in("raid_type", ["risk", "issue"]).in("status", ["pending", "in_progress", "identified", "assessing"]),
      ]);

      const overdue = overdueCount || 0;
      const blockers = blockerCount || 0;
      const actions = openActionCount || 0;
      const risks = openRiskCount || 0;

      let mood = "😊";
      if (overdue > 5 || blockers > 3) mood = "😰";
      else if (overdue > 0 || blockers > 0) mood = "😐";
      else mood = "🎉";

      const lines = [
        `${mood} *Project Health Report*`,
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
        `<${SITE_URL}/dashboard|Open Dashboard>`,
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

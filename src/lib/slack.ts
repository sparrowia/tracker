/**
 * Slack notification utility.
 * Posts messages to Slack channels via Bot Token.
 * Server-side only (uses SLACK_BOT_TOKEN env var).
 */

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || "#uat-unified-ce-platform";

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: { type: string; text: string }[];
  fields?: { type: string; text: string }[];
}

export async function sendSlackMessage(opts: {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
}) {
  if (!SLACK_BOT_TOKEN) return;

  const channel = opts.channel || DEFAULT_CHANNEL;

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: opts.text,
        blocks: opts.blocks,
      }),
    });
  } catch {
    // Slack notifications are best-effort — don't break the app
  }
}

/** Notify: new public issue submitted */
export async function notifyNewIssue(opts: {
  projectName: string;
  title: string;
  issueType: string;
  reporter: string;
  channel?: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";
  await sendSlackMessage({
    channel: opts.channel,
    text: `🎫 New issue on *${opts.projectName}*: ${opts.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎫 *New Issue Submitted*\n*${opts.title}*\nProject: ${opts.projectName} · Type: ${opts.issueType} · Reporter: ${opts.reporter}`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${siteUrl}/dashboard|View in Tracker>` }],
      },
    ],
  });
}

/** Notify: extraction complete */
export async function notifyExtractionComplete(opts: {
  itemCounts: Record<string, number>;
  intakeId: string;
  channel?: string;
}) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";
  const parts = Object.entries(opts.itemCounts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}`);
  const summary = parts.join(", ") || "0 items";

  await sendSlackMessage({
    channel: opts.channel,
    text: `📋 Extraction complete: ${summary}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📋 *Extraction Complete*\n${summary} extracted and ready for review.`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `<${siteUrl}/intake/${opts.intakeId}/review|Review extraction>` }],
      },
    ],
  });
}

/** Notify: new blocker created */
export async function notifyNewBlocker(opts: {
  title: string;
  priority: string;
  projectName?: string;
  ownerName?: string;
  channel?: string;
}) {
  const emoji = opts.priority === "critical" ? "🔴" : "🚫";
  const details = [
    opts.projectName && `Project: ${opts.projectName}`,
    opts.ownerName && `Owner: ${opts.ownerName}`,
    `Priority: ${opts.priority}`,
  ].filter(Boolean).join(" · ");

  await sendSlackMessage({
    channel: opts.channel,
    text: `${emoji} New blocker: *${opts.title}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *New Blocker*\n*${opts.title}*\n${details}`,
        },
      },
    ],
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { sendSlackMessage } from '@/lib/slack';
import { CLAUDE_QUEUE_PROJECT_SLUG } from '@/lib/claude-notify';

// Phase 0 — post a "new task for Claude" message to the coding channel when Matt
// assigns a tracker item to Claude. Notification-only; makes no DB writes. Best-
// effort: any failure returns ok so it can never surface an error in the UI.
const CHANNEL = process.env.CLAUDE_QUEUE_CHANNEL || '#uni2-coding';

export async function POST(req: NextRequest) {
  try {
    const { itemTitle, itemType, entityId, projectSlug, displayId } = (await req.json()) as {
      itemTitle?: string;
      itemType?: string;
      entityId?: string;
      projectSlug?: string;
      displayId?: string | null;
    };

    // Belt-and-suspenders: only the private PM project pings the channel.
    if (projectSlug && projectSlug !== CLAUDE_QUEUE_PROJECT_SLUG) {
      return NextResponse.json({ ok: true, skipped: 'not the private project' });
    }

    const origin = req.headers.get('origin') || `https://${req.headers.get('host') || ''}`;
    const link = projectSlug ? `${origin}/projects/${projectSlug}${entityId ? `#action-${entityId}` : ''}` : origin;
    const label = displayId ? `${displayId} — ${itemTitle}` : itemTitle;

    await sendSlackMessage({
      channel: CHANNEL,
      text: `:robot_face: *New task assigned to Claude* (${itemType || 'item'})\n*${label}*\n${link}`,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, note: 'best-effort' });
  }
}

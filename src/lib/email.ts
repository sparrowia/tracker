/**
 * Email utility using Gmail SMTP via nodemailer.
 * Server-side only (uses SMTP_USER / SMTP_PASS env vars).
 */

import nodemailer from "nodemailer";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) {
    const msg = "SMTP not configured (missing SMTP_USER or SMTP_PASS)";
    console.error(msg);
    return { success: false, error: msg };
  }

  try {
    await t.sendMail({
      from: `"Edcetera Tracker" <${SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Email send failed";
    console.error("Email send failed:", err);
    return { success: false, error: msg };
  }
}

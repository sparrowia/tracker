import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// This endpoint verifies an invite/magic link token server-side,
// avoiding PKCE issues that happen with Supabase's client-side redirect flow.
// The email link points here instead of Supabase's /auth/v1/verify.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type") || "magiclink";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://edcet-tracker.vercel.app";

  // Verify the token server-side using the admin client
  const { data, error } = await admin.auth.verifyOtp({
    token_hash: token,
    type: type === "invite" ? "invite" : "magiclink",
  });

  if (error || !data?.session) {
    const msg = encodeURIComponent(error?.message || "Invalid or expired link. Ask your admin to resend the invite.");
    return NextResponse.redirect(new URL(`/login?error=${msg}`, request.url));
  }

  // Set session cookies via redirect to callback with the session tokens
  // The callback page will pick up the hash fragment tokens and set the session
  const redirectUrl = new URL(`${siteUrl}/auth/callback`);
  const hash = `#access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=invite`;

  return NextResponse.redirect(redirectUrl.toString() + hash);
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

// Verifies an invite / password-reset (magic link) token server-side.
// The email link points here instead of Supabase's /auth/v1/verify to avoid
// PKCE issues with the client-side redirect flow.
//
// We verify with the COOKIE-BASED server client so a successful verifyOtp
// writes the session straight into cookies. Previously this route verified
// with the admin client and tried to hand the session to the browser via
// tokens in a URL fragment (#access_token=...) through an HTTP redirect --
// fragments don't reliably survive a server redirect, so the browser often
// arrived with no session and got bounced back to /login (no way to set a
// password). Cookies remove that fragile handoff.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const type = url.searchParams.get("type") || "magiclink";

  // Only allow safe in-app destinations (no open redirect).
  const nextParam = url.searchParams.get("next") || "/set-password";
  const next = nextParam.startsWith("/") ? nextParam : "/set-password";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  // Cookie-based SSR client: verifyOtp persists the session to cookies.
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: type === "invite" ? "invite" : "magiclink",
  });

  if (error) {
    const msg = encodeURIComponent(
      error.message || "Invalid or expired link. Ask your admin to resend the invite.",
    );
    return NextResponse.redirect(new URL(`/login?error=${msg}`, request.url));
  }

  // Session now lives in cookies. Hand off to /auth/callback (which links the
  // invite and lands the user on set-password) via a plain redirect -- no
  // fragment tokens to lose.
  redirect(`/auth/callback?next=${encodeURIComponent(next)}`);
}

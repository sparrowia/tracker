import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // If env vars are missing, allow the request through without auth
    // This prevents MIDDLEWARE_INVOCATION_FAILED errors during build/preview
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // If a ?code= param arrives on any path other than /auth/callback,
  // redirect to the callback so the code exchange happens properly.
  // This catches cases where Supabase redirects to root or login with a code.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/auth/callback")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    // Preserve the code param, drop everything else
    url.search = `?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/set-password") &&
    !request.nextUrl.pathname.startsWith("/issues") &&
    !request.nextUrl.pathname.startsWith("/api/issues") &&
    !request.nextUrl.pathname.startsWith("/api/slack") &&
    !request.nextUrl.pathname.startsWith("/api/notify") &&
    !request.nextUrl.pathname.startsWith("/api/invite/verify") &&
    !request.nextUrl.pathname.startsWith("/api/auth/reset-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Check if user is deactivated (skip on RSC fetch requests to reduce latency)
  const isRscFetch = request.headers.get("rsc") === "1" || request.headers.get("next-router-state-tree") !== null;
  if (
    user &&
    !isRscFetch &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/set-password")
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("deactivated_at")
      .eq("id", user.id)
      .single();

    if (profile?.deactivated_at) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "account_deactivated");
      return NextResponse.redirect(url);
    }
  }

  // Prevent CDN/edge caching of authenticated pages so navigating back
  // always fetches fresh data (e.g. externally submitted issues).
  supabaseResponse.headers.set("Cache-Control", "no-store, max-age=0");

  return supabaseResponse;
}

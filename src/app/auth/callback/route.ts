import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // Mark matching invitation as accepted
      try {
        const admin = createAdminClient();
        await admin
          .from("invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("email", data.user.email!)
          .is("accepted_at", null);
      } catch {
        // Non-critical — don't block login
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

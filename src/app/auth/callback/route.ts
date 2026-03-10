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
      // Check if this is an invited user who hasn't accepted yet
      const admin = createAdminClient();
      const { data: invitation } = await admin
        .from("invitations")
        .select("id")
        .eq("email", data.user.email!)
        .is("accepted_at", null)
        .maybeSingle();

      if (invitation) {
        // Mark invitation as accepted
        await admin
          .from("invitations")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invitation.id);

        // Redirect to set-password page for new invited users
        return NextResponse.redirect(`${origin}/set-password`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

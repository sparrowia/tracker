import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("invitations")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (invitation) {
    await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);
  }

  // Link people.profile_id for the user who just signed in
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    await admin
      .from("people")
      .update({ profile_id: profile.id })
      .eq("email", email)
      .eq("org_id", profile.org_id)
      .is("profile_id", null);
  }

  return NextResponse.json({ success: true });
}

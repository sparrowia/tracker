import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const emailLower = email.toLowerCase();

  // Mark invitation accepted (case-insensitive)
  const { data: invitations } = await admin
    .from("invitations")
    .select("id, email")
    .is("accepted_at", null);

  const matchingInvite = (invitations || []).find(
    (inv: { id: string; email: string }) => inv.email.toLowerCase() === emailLower
  );

  if (matchingInvite) {
    const { error: invErr } = await admin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", matchingInvite.id);
    if (invErr) console.error("Failed to mark invitation accepted:", invErr);
  }

  // Link people.profile_id for the user who just signed in
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, org_id, email");

  const matchingProfile = (profiles || []).find(
    (p: { id: string; org_id: string; email: string }) => p.email.toLowerCase() === emailLower
  );

  if (matchingProfile) {
    const { error: linkErr } = await admin
      .from("people")
      .update({ profile_id: matchingProfile.id })
      .ilike("email", emailLower)
      .eq("org_id", matchingProfile.org_id)
      .is("profile_id", null);
    if (linkErr) console.error("Failed to link profile_id:", linkErr);
  }

  return NextResponse.json({ success: true });
}

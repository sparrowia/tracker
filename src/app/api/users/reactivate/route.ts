import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  // Only super_admin can reactivate
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { user_id } = body as { user_id: string };

  if (!user_id) {
    return NextResponse.json(
      { error: "user_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify target is in same org and is deactivated
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, deactivated_at")
    .eq("id", user_id)
    .single();

  if (!target || target.org_id !== profile.org_id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!target.deactivated_at) {
    return NextResponse.json(
      { error: "User is not deactivated" },
      { status: 400 }
    );
  }

  // Clear deactivated_at
  const { error: updateError } = await admin
    .from("profiles")
    .update({ deactivated_at: null })
    .eq("id", user_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Unban in auth
  const { error: unbanError } = await admin.auth.admin.updateUserById(user_id, {
    ban_duration: "none",
  });

  if (unbanError) {
    return NextResponse.json({ error: unbanError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

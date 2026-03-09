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

  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { user_id } = body as { user_id: string };

  if (!user_id) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  if (user_id === profile.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
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
      { error: "User must be deactivated before deleting" },
      { status: 400 }
    );
  }

  // Delete profile (cascade will handle related records)
  const { error: profileError } = await admin
    .from("profiles")
    .delete()
    .eq("id", user_id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Delete from auth
  const { error: authError } = await admin.auth.admin.deleteUser(user_id);

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

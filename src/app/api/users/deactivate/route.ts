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

  if (!profile || !["super_admin", "admin"].includes(profile.role)) {
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

  // Prevent self-deactivation
  if (user_id === profile.id) {
    return NextResponse.json(
      { error: "Cannot deactivate yourself" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify target is in same org
  const { data: target } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user_id)
    .single();

  if (!target || target.org_id !== profile.org_id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent deactivating super_admin unless you are super_admin
  if (target.role === "super_admin" && profile.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super admins can deactivate other super admins" },
      { status: 403 }
    );
  }

  // Set deactivated_at
  const { error: updateError } = await admin
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("id", user_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Ban in auth
  const { error: banError } = await admin.auth.admin.updateUserById(user_id, {
    ban_duration: "876000h", // ~100 years
  });

  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

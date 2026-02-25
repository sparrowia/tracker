import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "No service role key" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  // Check if table already exists by trying to select from it
  const { error: checkErr } = await supabase
    .from("term_corrections")
    .select("id")
    .limit(1);

  if (!checkErr) {
    return NextResponse.json({ message: "Table already exists" });
  }

  // Table doesn't exist — create it via SQL using the rpc approach
  // Since we can't run raw SQL via supabase-js, we'll create it through
  // a workaround: insert/select operations that implicitly need the table.
  // Instead, let's use the Supabase Management API SQL endpoint.

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(
    /https:\/\/(.+)\.supabase\.co/
  )?.[1];

  if (!projectRef) {
    return NextResponse.json({ error: "Cannot determine project ref" }, { status: 500 });
  }

  // Use the Supabase SQL API (available at /pg/query for service role)
  const sql = `
    create table if not exists term_corrections (
      id uuid primary key default gen_random_uuid(),
      org_id uuid references organizations(id) on delete cascade not null,
      wrong_term text not null,
      correct_term text not null,
      notes text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    alter table term_corrections enable row level security;

    DO $$ BEGIN
      create policy "Users can view their org term corrections"
        on term_corrections for select
        using (org_id = auth.user_org_id());
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      create policy "Users can insert their org term corrections"
        on term_corrections for insert
        with check (org_id = auth.user_org_id());
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      create policy "Users can update their org term corrections"
        on term_corrections for update
        using (org_id = auth.user_org_id());
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      create policy "Users can delete their org term corrections"
        on term_corrections for delete
        using (org_id = auth.user_org_id());
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `;

  // Try the pg endpoint
  const pgRes = await fetch(
    `https://${projectRef}.supabase.co/pg/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!pgRes.ok) {
    const body = await pgRes.text();
    return NextResponse.json(
      { error: `pg/query failed (${pgRes.status}): ${body}` },
      { status: 500 }
    );
  }

  const pgResult = await pgRes.json();
  return NextResponse.json({ success: true, result: pgResult });
}

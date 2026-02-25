-- Term corrections / glossary for AI extraction
-- Stores common mistranslations so the extraction prompt can correct them
create table if not exists term_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  wrong_term text not null,
  correct_term text not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table term_corrections enable row level security;

create policy "Users can view their org term corrections"
  on term_corrections for select
  using (org_id = auth.user_org_id());

create policy "Users can insert their org term corrections"
  on term_corrections for insert
  with check (org_id = auth.user_org_id());

create policy "Users can update their org term corrections"
  on term_corrections for update
  using (org_id = auth.user_org_id());

create policy "Users can delete their org term corrections"
  on term_corrections for delete
  using (org_id = auth.user_org_id());

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor, Initiative, Intake } from "@/lib/types";
import ProjectTabs from "@/components/project-tabs";
import ProjectHeader from "@/components/project-header";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!project) notFound();

  const p = project as Project;

  // All queries in a single parallel batch — including initiative breadcrumb
  const [
    { data: actionItems },
    { data: archivedActionItems },
    { data: raidEntries },
    { data: blockers },
    { data: vendors },
    { data: allPeople },
    { data: initiativeData },
    { data: intakeData },
    { data: projectVendorLinks },
  ] = await Promise.all([
    supabase
      .from("action_item_ages")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("priority")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("action_items")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .eq("status", "complete")
      .order("resolved_at", { ascending: false }),
    supabase
      .from("raid_entries")
      .select("*, owner:people!raid_entries_owner_id_fkey(*), reporter:people!raid_entries_reporter_id_fkey(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("sort_order"),
    supabase
      .from("blocker_ages")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("priority"),
    supabase
      .from("vendors")
      .select("*")
      .order("name"),
    supabase
      .from("people")
      .select("*")
      .order("full_name"),
    p.initiative_id
      ? supabase.from("initiatives").select("*").eq("id", p.initiative_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("intakes")
      .select("*")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_vendors")
      .select("vendor_id")
      .eq("project_id", p.id),
  ]);

  const initiative = initiativeData as Initiative | null;

  const typedActions = [...(actionItems || []), ...(archivedActionItems || [])] as (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  const typedRaid = (raidEntries || []) as (RaidEntry & { owner: Person | null; reporter: Person | null; vendor: Vendor | null })[];
  const typedBlockers = (blockers || []) as (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  const typedVendors = (vendors || []) as Vendor[];
  const projectVendorIds = new Set((projectVendorLinks || []).map((pv: { vendor_id: string }) => pv.vendor_id));
  const projectVendors = typedVendors.filter((v) => projectVendorIds.has(v.id));

  // Build full vendor list including vendors from items (for vendor owner pickers)
  const itemVendorIds = new Set<string>();
  for (const a of typedActions) { if (a.vendor_id) itemVendorIds.add(a.vendor_id); }
  for (const r of typedRaid) { if (r.vendor_id) itemVendorIds.add(r.vendor_id); }
  for (const b of typedBlockers) { if (b.vendor_id) itemVendorIds.add(b.vendor_id); }
  const allProjectVendorIds = new Set([...projectVendorIds, ...itemVendorIds]);
  const allProjectVendors = typedVendors.filter((v) => allProjectVendorIds.has(v.id));
  const typedPeople = (allPeople || []) as Person[];
  const typedIntakes = (intakeData || []) as Intake[];

  // Build entity → intake source map
  const intakeIds = typedIntakes.map((i) => i.id);
  let intakeSourceMap: Record<string, string> = {};
  if (intakeIds.length > 0) {
    const { data: intakeEntities } = await supabase
      .from("intake_entities")
      .select("entity_id, intake_id")
      .in("intake_id", intakeIds);
    if (intakeEntities) {
      intakeSourceMap = Object.fromEntries(intakeEntities.map((ie) => [ie.entity_id, ie.intake_id]));
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Breadcrumb */}
      {initiative && (
        <div className="text-sm text-gray-500">
          <Link href="/initiatives" className="hover:text-blue-600">Initiatives</Link>
          <span className="mx-1">/</span>
          <Link href={`/initiatives/${initiative.slug}`} className="hover:text-blue-600">{initiative.name}</Link>
          <span className="mx-1">/</span>
        </div>
      )}

      {/* Header */}
      <ProjectHeader project={p} vendors={allProjectVendors} people={typedPeople} />

      {/* Tabbed content: Agenda, Blockers, RAID, Action Items */}
      <ProjectTabs
        project={p}
        blockers={typedBlockers}
        actions={typedActions}
        raidEntries={typedRaid}
        people={typedPeople}
        vendors={typedVendors}
        agendaRows={[]}
        intakes={typedIntakes}
        intakeSourceMap={intakeSourceMap}
      />
    </div>
  );
}

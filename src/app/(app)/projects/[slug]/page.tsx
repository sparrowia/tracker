import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor, Initiative, ProjectAgendaRow } from "@/lib/types";
import ProjectTabs from "@/components/project-tabs";

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

  const [
    { data: actionItems },
    { data: raidEntries },
    { data: blockers },
    { data: vendors },
    { data: allPeople },
    { data: agendaRows },
  ] = await Promise.all([
    supabase
      .from("action_item_ages")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("priority")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("raid_entries")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("raid_type")
      .order("priority"),
    supabase
      .from("blocker_ages")
      .select("*, owner:people(*), vendor:vendors(*)")
      .eq("project_id", p.id)
      .order("priority"),
    supabase
      .from("project_vendors")
      .select("vendor:vendors(*)")
      .eq("project_id", p.id),
    supabase
      .from("people")
      .select("*")
      .order("full_name"),
    supabase.rpc("generate_project_agenda", {
      p_project_id: p.id,
      p_limit: 20,
    }),
  ]);

  // Fetch initiative if project has one
  let initiative: Initiative | null = null;
  if (p.initiative_id) {
    const { data } = await supabase
      .from("initiatives")
      .select("*")
      .eq("id", p.initiative_id)
      .single();
    initiative = data as Initiative | null;
  }

  const typedActions = (actionItems || []) as (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  const typedRaid = (raidEntries || []) as (RaidEntry & { owner: Person | null; vendor: Vendor | null })[];
  const typedBlockers = (blockers || []) as (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedVendors = ((vendors || []).map((v: any) => v.vendor).filter(Boolean)) as Vendor[];
  const typedPeople = (allPeople || []) as Person[];
  const typedAgenda = (agendaRows || []) as ProjectAgendaRow[];

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
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
            {healthLabel(p.health)}
          </span>
        </div>
        {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
        <div className="flex gap-6 mt-3 text-sm text-gray-500">
          {p.platform_status && <span>Platform: {p.platform_status}</span>}
          {p.target_completion && <span>Target: {formatDateShort(p.target_completion)}</span>}
        </div>
        {typedVendors.length > 0 && (
          <div className="flex gap-2 mt-3">
            {typedVendors.map((v) => (
              <Link
                key={v.id}
                href={`/settings/vendors/${v.id}`}
                className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              >
                {v.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Tabbed content: Agenda, Blockers, RAID, Action Items */}
      <ProjectTabs
        project={p}
        blockers={typedBlockers}
        actions={typedActions}
        raidEntries={typedRaid}
        people={typedPeople}
        vendors={typedVendors}
        agendaRows={typedAgenda}
      />
    </div>
  );
}

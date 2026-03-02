import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { healthColor, healthLabel, priorityColor, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor } from "@/lib/types";
import RaidLog from "@/components/raid-log";

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
  ]);

  const typedActions = (actionItems || []) as (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  const typedRaid = (raidEntries || []) as (RaidEntry & { owner: Person | null; vendor: Vendor | null })[];
  const typedBlockers = (blockers || []) as (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedVendors = ((vendors || []).map((v: any) => v.vendor).filter(Boolean)) as Vendor[];
  const typedPeople = (allPeople || []) as Person[];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
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
                href={`/vendors/${v.id}`}
                className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              >
                {v.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Blockers */}
      {typedBlockers.length > 0 && (
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-red-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-red-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Blocker</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Impact</th>
                </tr>
              </thead>
              <tbody>
                {typedBlockers.map((b) => (
                  <tr key={b.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{b.title}</td>
                    <td className="px-4 py-3 text-sm">
                      {b.owner ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                            {b.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </span>
                          <span className="text-gray-700">{b.owner.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-700 font-medium">
                      {b.age_days != null ? formatAge(b.age_days) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.impact_description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Action Items */}
      <section>
        {typedActions.length === 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Action Items</h2>
            <p className="text-sm text-gray-500">No action items.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Action Items</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {typedActions.map((ai) => {
                  const badge = statusBadge(ai.status);
                  return (
                    <tr key={ai.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{ai.title}</td>
                      <td className="px-4 py-3 text-sm">
                        {ai.owner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                              {ai.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-gray-700">{ai.owner.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(ai.priority)}`}>
                          {ai.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(ai.due_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{ai.age_days != null ? formatAge(ai.age_days) : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* RAID Log */}
      <RaidLog initialEntries={typedRaid} project={p} people={typedPeople} vendors={typedVendors} />
    </div>
  );
}

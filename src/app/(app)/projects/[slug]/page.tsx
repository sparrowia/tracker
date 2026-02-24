import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { healthColor, healthLabel, priorityColor, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor } from "@/lib/types";

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
  ]);

  const typedActions = (actionItems || []) as (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  const typedRaid = (raidEntries || []) as (RaidEntry & { owner: Person | null; vendor: Vendor | null })[];
  const typedBlockers = (blockers || []) as (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedVendors = ((vendors || []).map((v: any) => v.vendor).filter(Boolean)) as Vendor[];

  const risks = typedRaid.filter((r) => r.raid_type === "risk");
  const actions = typedRaid.filter((r) => r.raid_type === "action");
  const issues = typedRaid.filter((r) => r.raid_type === "issue");
  const decisions = typedRaid.filter((r) => r.raid_type === "decision");

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
          <h2 className="text-lg font-semibold text-red-700 mb-3">Active Blockers</h2>
          <div className="bg-red-50 rounded-lg border border-red-200 overflow-hidden">
            <table className="min-w-full divide-y divide-red-200">
              <thead className="bg-red-100/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Blocker</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-200">
                {typedBlockers.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{b.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.owner?.full_name || "—"}</td>
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
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Action Items</h2>
        {typedActions.length === 0 ? (
          <p className="text-sm text-gray-500">No action items.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {typedActions.map((ai) => {
                  const badge = statusBadge(ai.status);
                  return (
                    <tr key={ai.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{ai.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{ai.owner?.full_name || "—"}</td>
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
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">RAID Log</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Risks */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Risks ({risks.length})</h3>
            {risks.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              <div className="space-y-2">
                {risks.map((r) => (
                  <div key={r.id} className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{r.display_id}</span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(r.priority)}`}>{r.priority}</span>
                    </div>
                    <p className="text-sm text-gray-900 mt-1">{r.title}</p>
                    {r.impact && <p className="text-xs text-gray-500 mt-1">{r.impact}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Issues */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Issues ({issues.length})</h3>
            {issues.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              <div className="space-y-2">
                {issues.map((i) => (
                  <div key={i.id} className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{i.display_id}</span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(i.priority)}`}>{i.priority}</span>
                    </div>
                    <p className="text-sm text-gray-900 mt-1">{i.title}</p>
                    {i.impact && <p className="text-xs text-gray-500 mt-1">{i.impact}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Decisions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Decisions ({decisions.length})</h3>
            {decisions.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              <div className="space-y-2">
                {decisions.map((d) => (
                  <div key={d.id} className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{d.display_id}</span>
                      {d.decision_date && <span className="text-xs text-gray-500">{formatDateShort(d.decision_date)}</span>}
                    </div>
                    <p className="text-sm text-gray-900 mt-1">{d.title}</p>
                    {d.description && <p className="text-xs text-gray-500 mt-1">{d.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RAID Actions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Actions ({actions.length})</h3>
            {actions.length === 0 ? (
              <p className="text-sm text-gray-400">None</p>
            ) : (
              <div className="space-y-2">
                {actions.map((a) => {
                  const badge = statusBadge(a.status);
                  return (
                    <div key={a.id} className="bg-white p-3 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{a.display_id}</span>
                        <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${badge.className}`}>{badge.label}</span>
                      </div>
                      <p className="text-sm text-gray-900 mt-1">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{a.owner?.full_name || "Unassigned"}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

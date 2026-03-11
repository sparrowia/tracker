import { createClient } from "@/lib/supabase/server";
import { formatAge, priorityColor, priorityLabel, statusBadge, healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import Link from "next/link";
import type { ActionItem, Blocker, SupportTicket, RaidEntry, Project, Vendor, Person } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

async function getCriticalPath(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("action_item_ages")
    .select("*, owner:people(id, full_name), vendor:vendors(id, name), project:projects(id, name, slug)")
    .in("priority", ["critical", "high"])
    .in("status", ["pending", "in_progress", "at_risk", "blocked"])
    .order("priority")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(15);
  return (data || []) as (ActionItem & { owner: Person | null; vendor: Vendor | null; project: Project | null })[];
}

async function getBlockers(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("blocker_ages")
    .select("*, owner:people(id, full_name), vendor:vendors(id, name), project:projects(id, name, slug)")
    .order("priority")
    .order("first_flagged_at")
    .limit(15);
  return (data || []) as (Blocker & { owner: Person | null; vendor: Vendor | null; project: Project | null })[];
}

async function getSupportTickets(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("support_tickets")
    .select("*, vendor:vendors(id, name), project:projects(id, name, slug)")
    .neq("status", "complete")
    .order("priority")
    .order("opened_at")
    .limit(10);
  return (data || []) as (SupportTicket & { vendor: Vendor | null; project: Project | null })[];
}

async function getDecisions(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("raid_entries")
    .select("*, owner:people(id, full_name), project:projects(id, name, slug)")
    .eq("raid_type", "decision")
    .neq("status", "complete")
    .order("priority")
    .limit(10);
  return (data || []) as (RaidEntry & { owner: Person | null; project: Project | null })[];
}

async function getProjects(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, slug, health, platform_status, target_completion")
    .order("name");
  return (data || []) as Project[];
}

async function getVendorSummary(supabase: SupabaseClient) {
  const [{ data: vendors }, { data: counts }] = await Promise.all([
    supabase.from("vendors").select("id, name, slug").order("name"),
    supabase.rpc("vendor_item_counts"),
  ]);

  if (!vendors) return [];

  const countMap = new Map(
    ((counts || []) as { vendor_id: string; action_count: number; blocker_count: number; people_count: number }[])
      .map((c) => [c.vendor_id, c])
  );

  return (vendors as Vendor[])
    .map((vendor) => {
      const c = countMap.get(vendor.id);
      const actionCount = c?.action_count || 0;
      const blockerCount = c?.blocker_count || 0;
      return { vendor, actionCount, blockerCount, totalOpen: actionCount + blockerCount };
    })
    .filter((s) => s.totalOpen > 0)
    .sort((a, b) => b.totalOpen - a.totalOpen);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [criticalPath, blockers, supportTickets, decisions, projects, vendorSummary] =
    await Promise.all([
      getCriticalPath(supabase),
      getBlockers(supabase),
      getSupportTickets(supabase),
      getDecisions(supabase),
      getProjects(supabase),
      getVendorSummary(supabase),
    ]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Critical Path This Week */}
      <section>
        {criticalPath.length === 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Critical Path This Week</h2>
            <p className="text-sm text-gray-500">No critical items this week.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Critical Path This Week</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {criticalPath.map((item) => {
                  const badge = statusBadge(item.status);
                  return (
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-blue-50/60 relative group">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                        {item.project ? (
                          <Link href={`/projects/${item.project.slug}?tab=actions`} className="before:absolute before:inset-0">{item.title}</Link>
                        ) : item.title}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.owner ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                              {item.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-gray-700">{item.owner.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">{item.project?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>
                          {priorityLabel(item.priority)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{item.age_days != null ? formatAge(item.age_days) : "—"}</td>
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

      {/* Active Blockers */}
      <section>
        {blockers.length === 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Blockers</h2>
            <p className="text-sm text-gray-500">No active blockers.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Blocker</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id} className="border-b border-gray-200 hover:bg-red-50/60 relative group">
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                      {b.project ? (
                        <Link href={`/projects/${b.project.slug}?tab=blockers`} className="before:absolute before:inset-0">{b.title}</Link>
                      ) : b.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-blue-600">{b.project?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-blue-600">{b.vendor?.name || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={
                        b.age_severity === "critical" ? "text-red-600 font-medium" :
                        b.age_severity === "aging" ? "text-orange-600" : "text-gray-600"
                      }>
                        {b.age_days != null ? formatAge(b.age_days) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{b.impact_description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Two-column: Support Tickets + Decisions Needed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section>
          {supportTickets.length === 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Open Support Requests</h2>
              <p className="text-sm text-gray-500">No open tickets.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <div className="bg-gray-800 px-4 py-2.5">
                <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Open Support Requests</h2>
              </div>
              {supportTickets.map((t) => {
                const href = t.project ? `/projects/${t.project.slug}` : null;
                const inner = (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-gray-500">{t.ticket_number}</span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(t.priority)}`}>
                        {priorityLabel(t.priority)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 font-semibold mt-1">{t.title || t.description}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t.vendor?.name} {t.opened_at ? `· Opened ${formatDateShort(t.opened_at)}` : ""}
                    </p>
                  </>
                );
                return href ? (
                  <Link key={t.id} href={href} className="block px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-blue-50/60">
                    {inner}
                  </Link>
                ) : (
                  <div key={t.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          {decisions.length === 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Decisions Needed</h2>
              <p className="text-sm text-gray-500">No pending decisions.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <div className="bg-gray-800 px-4 py-2.5">
                <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Decisions Needed</h2>
              </div>
              {decisions.map((d) => {
                const href = d.project ? `/projects/${(d.project as Project).slug}?tab=raid` : null;
                const inner = (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{d.display_id}</span>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(d.priority)}`}>
                        {priorityLabel(d.priority)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 font-semibold mt-1">{d.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {d.owner?.full_name || "Unassigned"} · {d.project?.name || "General"}
                    </p>
                  </>
                );
                return href ? (
                  <Link key={d.id} href={href} className="block px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-blue-50/60">
                    {inner}
                  </Link>
                ) : (
                  <div key={d.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Vendor Accountability Summary */}
      <section>
        <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Accountability</h2>
        </div>
        {vendorSummary.length === 0 ? (
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 p-4">
            <p className="text-sm text-gray-500">No open vendor items.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {vendorSummary.map(({ vendor, actionCount, blockerCount, totalOpen }) => (
              <Link
                key={vendor.id}
                href={`/settings/vendors/${vendor.id}`}
                className="bg-white rounded-lg border border-gray-300 p-4 hover:border-blue-400 transition-colors"
              >
                <h3 className="font-semibold text-gray-900">{vendor.name}</h3>
                <div className="mt-2 flex gap-4 text-sm">
                  <span className="text-gray-600">{actionCount} actions</span>
                  {blockerCount > 0 && (
                    <span className="text-red-600 font-medium">{blockerCount} blockers</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500">{totalOpen} total open items</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Project Health */}
      <section>
        <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Project Health</h2>
        </div>
        {projects.length === 0 ? (
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 p-4">
            <p className="text-sm text-gray-500">No projects yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="bg-white rounded-lg border border-gray-300 p-4 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">{p.name}</h3>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                    {healthLabel(p.health)}
                  </span>
                </div>
                {p.platform_status && (
                  <p className="text-xs text-gray-500 mt-1">{p.platform_status}</p>
                )}
                {p.target_completion && (
                  <p className="text-xs text-gray-500 mt-1">Target: {formatDateShort(p.target_completion)}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

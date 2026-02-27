import { createClient } from "@/lib/supabase/server";
import { formatAge, priorityColor, statusBadge, healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import Link from "next/link";
import type { ActionItem, Blocker, SupportTicket, RaidEntry, Project, Vendor, Person } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

async function getCriticalPath(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("action_item_ages")
    .select("*, owner:people(*), vendor:vendors(*), project:projects(*)")
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
    .select("*, owner:people(*), vendor:vendors(*), project:projects(*)")
    .order("priority")
    .order("first_flagged_at")
    .limit(15);
  return (data || []) as (Blocker & { owner: Person | null; vendor: Vendor | null; project: Project | null })[];
}

async function getSupportTickets(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("support_tickets")
    .select("*, vendor:vendors(*), project:projects(*)")
    .neq("status", "complete")
    .order("priority")
    .order("opened_at")
    .limit(10);
  return (data || []) as (SupportTicket & { vendor: Vendor | null; project: Project | null })[];
}

async function getDecisions(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("raid_entries")
    .select("*, owner:people(*), project:projects(*)")
    .eq("raid_type", "decision")
    .neq("status", "complete")
    .order("priority")
    .limit(10);
  return (data || []) as (RaidEntry & { owner: Person | null; project: Project | null })[];
}

async function getProjects(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("projects")
    .select("*")
    .order("name");
  return (data || []) as Project[];
}

async function getVendorSummary(supabase: SupabaseClient) {
  const [{ data: vendors }, { data: actions }, { data: blockers }] = await Promise.all([
    supabase.from("vendors").select("*").order("name"),
    supabase.from("action_items").select("vendor_id").neq("status", "complete").not("vendor_id", "is", null),
    supabase.from("blockers").select("vendor_id").is("resolved_at", null).not("vendor_id", "is", null),
  ]);

  if (!vendors) return [];

  const actionCounts = new Map<string, number>();
  const blockerCounts = new Map<string, number>();
  for (const a of actions || []) {
    actionCounts.set(a.vendor_id, (actionCounts.get(a.vendor_id) || 0) + 1);
  }
  for (const b of blockers || []) {
    blockerCounts.set(b.vendor_id, (blockerCounts.get(b.vendor_id) || 0) + 1);
  }

  return (vendors as Vendor[])
    .map((vendor) => {
      const actionCount = actionCounts.get(vendor.id) || 0;
      const blockerCount = blockerCounts.get(vendor.id) || 0;
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
                    <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{item.title}</td>
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
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {item.project ? (
                          <Link href={`/projects/${item.project.slug}`} className="text-blue-600 hover:underline">
                            {item.project.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>
                          {item.priority}
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Escalations</th>
                </tr>
              </thead>
              <tbody>
                {blockers.map((b) => (
                  <tr key={b.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{b.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {b.project ? (
                        <Link href={`/projects/${b.project.slug}`} className="text-blue-600 hover:underline">
                          {b.project.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {b.vendor ? (
                        <Link href={`/vendors/${b.vendor.id}`} className="text-blue-600 hover:underline">
                          {b.vendor.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={
                        b.age_severity === "critical" ? "text-red-600 font-medium" :
                        b.age_severity === "aging" ? "text-orange-600" : "text-gray-600"
                      }>
                        {b.age_days != null ? formatAge(b.age_days) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{b.impact_description || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.escalation_count > 0 ? `${b.escalation_count}x` : "—"}</td>
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
              {supportTickets.map((t) => (
                <div key={t.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-500">{t.ticket_number}</span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(t.priority)}`}>
                      {t.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 font-semibold mt-1">{t.title || t.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t.vendor?.name} {t.opened_at ? `· Opened ${formatDateShort(t.opened_at)}` : ""}
                  </p>
                </div>
              ))}
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
              {decisions.map((d) => (
                <div key={d.id} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{d.display_id}</span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(d.priority)}`}>
                      {d.priority}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 font-semibold mt-1">{d.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {d.owner?.full_name || "Unassigned"} · {d.project?.name || "General"}
                  </p>
                </div>
              ))}
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
                href={`/vendors/${vendor.id}`}
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

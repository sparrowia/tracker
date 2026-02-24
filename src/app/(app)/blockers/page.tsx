import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { priorityColor, formatAge } from "@/lib/utils";
import type { Blocker, Person, Vendor, Project } from "@/lib/types";

export default async function BlockersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("blocker_ages")
    .select("*, owner:people(*), vendor:vendors(*), project:projects(*)")
    .order("priority")
    .order("first_flagged_at");

  const blockers = (data || []) as (Blocker & {
    owner: Person | null;
    vendor: Vendor | null;
    project: Project | null;
  })[];

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Active Blockers ({blockers.length})
      </h1>

      {blockers.length === 0 ? (
        <p className="text-sm text-gray-500">No active blockers.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Escalations</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {blockers.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{b.title}</td>
                  <td className="px-4 py-3 text-sm">
                    {b.project ? (
                      <Link href={`/projects/${b.project.slug}`} className="text-blue-600 hover:underline">
                        {b.project.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {b.vendor ? (
                      <Link href={`/vendors/${b.vendor.id}`} className="text-blue-600 hover:underline">
                        {b.vendor.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{b.owner?.full_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(b.priority)}`}>
                      {b.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={
                      b.age_severity === "critical" ? "text-red-600 font-semibold" :
                      b.age_severity === "aging" ? "text-orange-600 font-medium" :
                      "text-gray-600"
                    }>
                      {b.age_days != null ? formatAge(b.age_days) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {b.escalation_count > 0 ? `${b.escalation_count}x` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {b.impact_description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

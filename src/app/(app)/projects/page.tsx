import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Project } from "@/lib/types";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("name");

  return (
    <div className="max-w-5xl mx-auto">
      {!projects || projects.length === 0 ? (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Projects</h1>
          <p className="text-sm text-gray-500">No projects yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          <div className="bg-gray-800 px-4 py-2.5">
            <h1 className="text-xs font-semibold text-white uppercase tracking-wide">Projects</h1>
          </div>
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-300">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Platform Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
              </tr>
            </thead>
            <tbody>
              {(projects as Project[]).map((p) => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.slug}`} className="text-sm font-semibold text-blue-600 hover:underline">
                      {p.name}
                    </Link>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                      {healthLabel(p.health)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.platform_status || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(p.target_completion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

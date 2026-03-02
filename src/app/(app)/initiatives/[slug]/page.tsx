import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Initiative, Project } from "@/lib/types";
import AddProjectButton from "@/components/add-project-button";

export default async function InitiativeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: initiative } = await supabase
    .from("initiatives")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!initiative) notFound();

  const init = initiative as Initiative;

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("initiative_id", init.id)
    .order("name");

  const typedProjects = (projects || []) as Project[];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link href="/initiatives" className="hover:text-blue-600">Initiatives</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900 font-medium">{init.name}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{init.name}</h1>
          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(init.health)}`}>
            {healthLabel(init.health)}
          </span>
        </div>
        {init.description && <p className="text-sm text-gray-600">{init.description}</p>}
        {init.target_completion && (
          <p className="text-sm text-gray-500 mt-2">Target: {formatDateShort(init.target_completion)}</p>
        )}
      </div>

      {/* Projects */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          <AddProjectButton initiativeId={init.id} />
        </div>

        {typedProjects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects in this initiative yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
                Projects ({typedProjects.length})
              </h3>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                </tr>
              </thead>
              <tbody>
                {typedProjects.map((p) => (
                  <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.slug}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        {p.name}
                      </Link>
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
      </section>
    </div>
  );
}

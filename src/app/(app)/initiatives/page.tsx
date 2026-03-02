import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Initiative, Project } from "@/lib/types";
import AddInitiativeButton from "@/components/add-initiative-button";

export default async function InitiativesPage() {
  const supabase = await createClient();

  const [{ data: initiatives }, { data: projects }] = await Promise.all([
    supabase.from("initiatives").select("*").order("name"),
    supabase.from("projects").select("*").order("name"),
  ]);

  const typedInitiatives = (initiatives || []) as Initiative[];
  const typedProjects = (projects || []) as Project[];

  // Group projects by initiative
  const projectsByInitiative = new Map<string, Project[]>();
  const unassigned: Project[] = [];

  for (const p of typedProjects) {
    if (p.initiative_id) {
      const list = projectsByInitiative.get(p.initiative_id) || [];
      list.push(p);
      projectsByInitiative.set(p.initiative_id, list);
    } else {
      unassigned.push(p);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Initiatives</h1>
        <AddInitiativeButton />
      </div>

      {typedInitiatives.length === 0 && unassigned.length === 0 ? (
        <p className="text-sm text-gray-500">No initiatives or projects yet.</p>
      ) : (
        <div className="space-y-6">
          {typedInitiatives.map((init) => {
            const initProjects = projectsByInitiative.get(init.id) || [];
            return (
              <div key={init.id} className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Link href={`/initiatives/${init.slug}`} className="text-xs font-semibold text-white uppercase tracking-wide hover:text-blue-300">
                      {init.name}
                    </Link>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(init.health)}`}>
                      {healthLabel(init.health)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{initProjects.length} project{initProjects.length !== 1 ? "s" : ""}</span>
                    {init.target_completion && (
                      <span>Target: {formatDateShort(init.target_completion)}</span>
                    )}
                  </div>
                </div>

                {init.description && (
                  <p className="px-4 py-2 text-sm text-gray-600 border-b border-gray-200">{init.description}</p>
                )}

                {initProjects.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-400">No projects assigned.</p>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {initProjects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.slug}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                          {healthLabel(p.health)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Projects */}
          {unassigned.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <div className="bg-gray-700 px-4 py-2.5">
                <span className="text-xs font-semibold text-white uppercase tracking-wide">
                  Unassigned Projects
                </span>
                <span className="text-xs text-gray-400 ml-3">{unassigned.length}</span>
              </div>
              <div className="divide-y divide-gray-200">
                {unassigned.map((p) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.slug}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                      {healthLabel(p.health)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

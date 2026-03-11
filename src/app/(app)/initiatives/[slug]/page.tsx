"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Initiative, Project } from "@/lib/types";
import AddProjectButton from "@/components/add-project-button";

export default function InitiativeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: init } = await supabase
        .from("initiatives")
        .select("*")
        .eq("slug", slug)
        .single();

      if (!init) { setLoading(false); return; }

      const { data: projs } = await supabase
        .from("projects")
        .select("*")
        .eq("initiative_id", init.id)
        .order("name");

      setInitiative(init as Initiative);
      setProjects((projs || []) as Project[]);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
        <div className="flex items-center gap-1">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-2 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-6 w-20 bg-gray-200 rounded-full" />
          </div>
          <div className="h-4 w-96 bg-gray-200 rounded mt-2" />
        </div>
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <div className="h-4 w-28 bg-gray-600 rounded" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-200 flex items-center gap-8">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-gray-500">Initiative not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link href="/initiatives" className="hover:text-blue-600">Initiatives</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900 font-medium">{initiative.name}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{initiative.name}</h1>
          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(initiative.health)}`}>
            {healthLabel(initiative.health)}
          </span>
        </div>
        {initiative.description && <p className="text-sm text-gray-600">{initiative.description}</p>}
        {initiative.target_completion && (
          <p className="text-sm text-gray-500 mt-2">Target: {formatDateShort(initiative.target_completion)}</p>
        )}
      </div>

      {/* Projects */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          <AddProjectButton initiativeId={initiative.id} />
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects in this initiative yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
                Projects ({projects.length})
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
                {projects.map((p) => (
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

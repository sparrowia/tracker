"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import type { Initiative, Project } from "@/lib/types";
import AddInitiativeButton from "@/components/add-initiative-button";
import { useRole } from "@/components/role-context";

const UNASSIGNED = "__unassigned__";

export default function InitiativesPage() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const supabase = createClient();
  const { role, profileId, userPersonId } = useRole();

  const reload = useCallback(async () => {
    const [{ data: initData }, { data: projData }] = await Promise.all([
      supabase.from("initiatives").select("*").order("name"),
      supabase.from("projects").select("*").order("name"),
    ]);
    let filteredProjects = (projData || []) as Project[];

    // For regular users, only show projects they are part of
    if (role === "user" && userPersonId && profileId) {
      const { data: visibleIds } = await supabase.rpc("user_visible_project_ids", { p_person_id: userPersonId, p_profile_id: profileId });
      const idSet = new Set((visibleIds || []).map(String));
      filteredProjects = filteredProjects.filter((p) => idSet.has(p.id));
    }

    setInitiatives((initData || []) as Initiative[]);
    setProjects(filteredProjects);
    setLoading(false);
  }, [role, profileId, userPersonId]);

  useEffect(() => { reload(); }, [reload]);

  // Group projects by initiative
  const projectsByInitiative = new Map<string, Project[]>();
  const unassigned: Project[] = [];
  for (const p of projects) {
    if (p.initiative_id) {
      const list = projectsByInitiative.get(p.initiative_id) || [];
      list.push(p);
      projectsByInitiative.set(p.initiative_id, list);
    } else {
      unassigned.push(p);
    }
  }

  function onDragStart(e: React.DragEvent, projectId: string) {
    setDragProjectId(projectId);
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(targetId);
  }

  function onDragLeave(e: React.DragEvent, targetId: string) {
    // Only clear if we're actually leaving the container (not entering a child)
    const related = e.relatedTarget as HTMLElement | null;
    const current = e.currentTarget as HTMLElement;
    if (!related || !current.contains(related)) {
      if (dropTarget === targetId) setDropTarget(null);
    }
  }

  async function onDrop(e: React.DragEvent, targetInitiativeId: string | null) {
    e.preventDefault();
    setDropTarget(null);
    if (!dragProjectId) return;

    const project = projects.find((p) => p.id === dragProjectId);
    if (!project) return;

    // Skip if already in this initiative
    if (project.initiative_id === targetInitiativeId) {
      setDragProjectId(null);
      return;
    }

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) =>
        p.id === dragProjectId ? { ...p, initiative_id: targetInitiativeId } : p
      )
    );
    setDragProjectId(null);

    // Persist
    await supabase
      .from("projects")
      .update({ initiative_id: targetInitiativeId })
      .eq("id", dragProjectId);
  }

  function onDragEnd() {
    setDragProjectId(null);
    setDropTarget(null);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Initiatives</h1>
        <AddInitiativeButton onSaved={reload} />
      </div>

      {initiatives.length === 0 && unassigned.length === 0 ? (
        <p className="text-sm text-gray-500">No initiatives or projects yet.</p>
      ) : (
        <div className="space-y-6">
          {initiatives.filter((init) => role !== "user" || (projectsByInitiative.get(init.id) || []).length > 0).map((init) => {
            const initProjects = projectsByInitiative.get(init.id) || [];
            const isOver = dropTarget === init.id;
            return (
              <div
                key={init.id}
                className={`bg-white rounded-lg border overflow-hidden transition-colors ${
                  isOver ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-300"
                }`}
                onDragOver={(e) => onDragOver(e, init.id)}
                onDragLeave={(e) => onDragLeave(e, init.id)}
                onDrop={(e) => onDrop(e, init.id)}
              >
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

                {initProjects.length === 0 && !isOver && (
                  <p className="px-4 py-3 text-sm text-gray-400">No projects assigned. Drag projects here.</p>
                )}

                {initProjects.length === 0 && isOver && (
                  <p className="px-4 py-3 text-sm text-blue-500 font-medium">Drop to assign here</p>
                )}

                {initProjects.length > 0 && (
                  <div className="divide-y divide-gray-200">
                    {initProjects.map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, p.id)}
                        onDragEnd={onDragEnd}
                        className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing ${
                          dragProjectId === p.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0">
                            <circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/>
                            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                            <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                          </svg>
                          <Link href={`/projects/${p.slug}`} className="text-sm font-medium text-gray-900 hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                            {p.name}
                          </Link>
                        </div>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                          {healthLabel(p.health)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Projects */}
          <div
            className={`bg-white rounded-lg border overflow-hidden transition-colors ${
              dropTarget === UNASSIGNED ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-300"
            }`}
            onDragOver={(e) => onDragOver(e, UNASSIGNED)}
            onDragLeave={(e) => onDragLeave(e, UNASSIGNED)}
            onDrop={(e) => onDrop(e, null)}
          >
            <div className="bg-gray-700 px-4 py-2.5">
              <span className="text-xs font-semibold text-white uppercase tracking-wide">
                Unassigned Projects
              </span>
              <span className="text-xs text-gray-400 ml-3">{unassigned.length}</span>
            </div>
            {unassigned.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">All projects are assigned.</p>
            ) : (
              <div className="divide-y divide-gray-200">
                {unassigned.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, p.id)}
                    onDragEnd={onDragEnd}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing ${
                      dragProjectId === p.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0">
                        <circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/>
                        <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                        <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                      </svg>
                      <Link href={`/projects/${p.slug}`} className="text-sm font-medium text-gray-900 hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                        {p.name}
                      </Link>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                      {healthLabel(p.health)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  departmentStatusColor,
  departmentStatusLabel,
  formatDate,
  healthColor,
  healthLabel,
} from "@/lib/utils";
import type {
  Person,
  ProjectDepartmentStatus,
  DepartmentStatusLevel,
  ProjectHealth,
} from "@/lib/types";
import { ChevronLeft, ChevronRight, X, ExternalLink } from "lucide-react";
import Link from "next/link";

interface PresentationProject {
  id: string;
  name: string;
  slug: string;
  health: ProjectHealth;
  product_type: string | null;
  sponsorId: string | null;
  priority: number | null;
  projectedDate: string | null;
  projectedNotes: string | null;
  actualDate: string | null;
  actualNotes: string | null;
  asana_link: string | null;
}

function deriveHealth(statuses: ProjectDepartmentStatus[]): ProjectHealth | null {
  const levels = statuses.map((d) => d.status).filter(Boolean) as DepartmentStatusLevel[];
  if (levels.length === 0) return null;
  if (levels.includes("red")) return "blocked";
  if (levels.includes("yellow")) return "at_risk";
  return "on_track";
}

interface ItemCounts {
  actions: number;
  blockers: number;
  issues: number;
}

interface SteeringPresentationProps {
  projects: PresentationProject[];
  people: Person[];
  deptByEntity: Record<string, ProjectDepartmentStatus[]>;
  onClose: () => void;
}

export default function SteeringPresentation({
  projects,
  people,
  deptByEntity,
  onClose,
}: SteeringPresentationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [counts, setCounts] = useState<Record<string, ItemCounts>>({});
  const supabase = createClient();

  // Load item counts for all projects on mount
  useEffect(() => {
    const projectIds = projects.map((p) => p.id);
    Promise.all([
      supabase.from("action_items").select("project_id").in("project_id", projectIds).not("status", "in", '("complete","closed")'),
      supabase.from("blockers").select("project_id").in("project_id", projectIds).is("resolved_at", null),
      supabase.from("raid_entries").select("project_id").eq("raid_type", "issue").in("project_id", projectIds).is("resolved_at", null),
    ]).then(([{ data: actions }, { data: blockers }, { data: issues }]) => {
      const c: Record<string, ItemCounts> = {};
      for (const id of projectIds) c[id] = { actions: 0, blockers: 0, issues: 0 };
      for (const a of (actions || [])) if (a.project_id && c[a.project_id]) c[a.project_id].actions++;
      for (const b of (blockers || [])) if (b.project_id && c[b.project_id]) c[b.project_id].blockers++;
      for (const i of (issues || [])) if (i.project_id && c[i.project_id]) c[i.project_id].issues++;
      setCounts(c);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const project = projects[currentIndex];
  const sponsor = people.find((p) => p.id === project?.sponsorId);
  const deps = project ? (deptByEntity[project.id] || []) : [];
  const derivedHealth = deriveHealth(deps);
  const displayHealth = derivedHealth ?? project?.health ?? "in_progress";
  const itemCounts = project ? counts[project.id] : undefined;

  const goNext = useCallback(() => {
    if (currentIndex < projects.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, projects.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  if (!project) return null;

  const depsWithContent = deps.filter((d) => d.roadblocks || d.decisions || d.status);
  const depsEmpty = deps.filter((d) => !d.roadblocks && !d.decisions && !d.status);

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Projects</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {projects.map((p, idx) => {
            const pDeps = deptByEntity[p.id] || [];
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={p.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                  isCurrent ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {p.priority && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-gray-300 text-[9px] font-bold text-white flex-shrink-0">
                      {p.priority}
                    </span>
                  )}
                  <span className="truncate flex-1">{p.name}</span>
                  {pDeps.length > 0 && (
                    <div className="flex gap-0.5 flex-shrink-0">
                      {pDeps.map((ds) => (
                        <span key={ds.id} className={`inline-block h-2 w-2 rounded-full ${departmentStatusColor(ds.status)}`} />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-gray-200 text-[10px] text-gray-400">
          ← → navigate &middot; Esc close
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-500">{currentIndex + 1} of {projects.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} disabled={currentIndex === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={goNext} disabled={currentIndex === projects.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        {/* Card */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-10 pt-8 pb-6">
                <div className="flex items-center gap-3 mb-4">
                  {project.priority && (
                    <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gray-200 text-base font-bold text-gray-700">
                      {project.priority}
                    </span>
                  )}
                  <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full border ${healthColor(displayHealth)}`}>
                    {healthLabel(displayHealth)}
                  </span>
                  {project.product_type && (
                    <span className="inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      {project.product_type}
                    </span>
                  )}
                  {deps.length > 0 && (
                    <div className="flex gap-1.5 ml-auto">
                      {deps.map((ds) => (
                        <span key={ds.id} className={`inline-block h-4 w-4 rounded-full ${departmentStatusColor(ds.status)}`} title={`${ds.department}: ${departmentStatusLabel(ds.status)}`} />
                      ))}
                    </div>
                  )}
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-1">
                  <Link href={`/projects/${project.slug}`} className="hover:text-blue-600">{project.name}</Link>
                </h1>

                {/* Key info grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 mt-6">
                  {sponsor && (
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Sponsor</div>
                      <div className="text-sm text-gray-900 font-medium mt-0.5">{sponsor.full_name}</div>
                    </div>
                  )}
                  {project.projectedDate && (
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Projected</div>
                      <div className="text-sm text-gray-900 font-medium mt-0.5">{formatDate(project.projectedDate)}</div>
                    </div>
                  )}
                  {project.actualDate && (
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Actual</div>
                      <div className="text-sm text-gray-900 font-medium mt-0.5">{formatDate(project.actualDate)}</div>
                    </div>
                  )}
                  {itemCounts && (
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Open Items</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm"><span className="font-bold text-gray-900">{itemCounts.actions}</span> <span className="text-gray-500">actions</span></span>
                        <span className="text-sm"><span className="font-bold text-red-600">{itemCounts.blockers}</span> <span className="text-gray-500">blockers</span></span>
                        <span className="text-sm"><span className="font-bold text-amber-600">{itemCounts.issues}</span> <span className="text-gray-500">issues</span></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {(project.projectedNotes || project.actualNotes) && (
                <div className="px-10 py-4 border-t border-gray-100 bg-gray-50/50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {project.projectedNotes && (
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Projected Notes</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.projectedNotes}</p>
                      </div>
                    )}
                    {project.actualNotes && (
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Actual Notes</div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.actualNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Department statuses — always shown */}
              {deps.length > 0 && (
                <div className="px-10 py-5 border-t border-gray-200">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-3">Department Status</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {depsWithContent.map((ds) => {
                      const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
                      return (
                        <div key={ds.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-block h-3 w-3 rounded-full flex-shrink-0 ${departmentStatusColor(ds.status)}`} />
                            <span className="text-sm font-semibold text-gray-800">{ds.department}</span>
                            {rep && <span className="text-xs text-gray-400">— {rep.full_name}</span>}
                          </div>
                          {ds.roadblocks && (
                            <p className="text-xs text-gray-600 whitespace-pre-wrap mb-1">{ds.roadblocks}</p>
                          )}
                          {ds.decisions && (
                            <p className="text-xs text-blue-600 whitespace-pre-wrap">Decision: {ds.decisions}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Departments with no content — compact row */}
                  {depsEmpty.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-3">
                      {depsEmpty.map((ds) => (
                        <div key={ds.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${departmentStatusColor(ds.status)}`} />
                          {ds.department}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Footer — Asana link */}
              {project.asana_link && (
                <div className="px-10 py-3 border-t border-gray-100 bg-gray-50/50">
                  <a href={project.asana_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800">
                    <ExternalLink className="h-3 w-3" />
                    View in Asana
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

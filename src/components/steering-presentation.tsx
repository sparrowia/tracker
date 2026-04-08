"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, ExternalLink } from "lucide-react";
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
  const [showDetails, setShowDetails] = useState(false);

  const project = projects[currentIndex];
  const sponsor = people.find((p) => p.id === project?.sponsorId);
  const deps = project ? (deptByEntity[project.id] || []) : [];
  const derivedHealth = deriveHealth(deps);
  const displayHealth = derivedHealth ?? project?.health ?? "in_progress";

  const goNext = useCallback(() => {
    if (currentIndex < projects.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowDetails(false);
    }
  }, [currentIndex, projects.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowDetails(false);
    }
  }, [currentIndex]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goNext();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goPrev();
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); setShowDetails((d) => !d); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  if (!project) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex">
      {/* Sidebar — project list */}
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
                onClick={() => { setCurrentIndex(idx); setShowDetails(false); }}
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
                        <span
                          key={ds.id}
                          className={`inline-block h-2 w-2 rounded-full ${departmentStatusColor(ds.status)}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-gray-200 text-[10px] text-gray-400">
          ← → to navigate &middot; Space for details &middot; Esc to close
        </div>
      </div>

      {/* Main card area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} of {projects.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === projects.length - 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Card */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
          <div className="w-full max-w-3xl">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Card face */}
              <div className="px-10 py-8">
                {/* Top row: priority + health + dots */}
                <div className="flex items-center gap-3 mb-6">
                  {project.priority && (
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 text-sm font-bold text-gray-700">
                      {project.priority}
                    </span>
                  )}
                  <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full border ${healthColor(displayHealth)}`}>
                    {healthLabel(displayHealth)}
                  </span>
                  {deps.length > 0 && (
                    <div className="flex gap-1.5 ml-auto">
                      {deps.map((ds) => (
                        <span
                          key={ds.id}
                          className={`inline-block h-4 w-4 rounded-full ${departmentStatusColor(ds.status)}`}
                          title={`${ds.department}: ${departmentStatusLabel(ds.status)}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Project name */}
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  <Link href={`/projects/${project.slug}`} className="hover:text-blue-600">
                    {project.name}
                  </Link>
                </h1>

                {/* Product type */}
                {project.product_type && (
                  <div className="text-lg text-gray-500 mb-6">{project.product_type}</div>
                )}

                {/* Key info */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  {sponsor && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Sponsor</span>
                      <div className="text-gray-900 font-medium mt-0.5">{sponsor.full_name}</div>
                    </div>
                  )}
                  {project.projectedDate && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Projected Completion</span>
                      <div className="text-gray-900 font-medium mt-0.5">{formatDate(project.projectedDate)}</div>
                    </div>
                  )}
                  {project.actualDate && (
                    <div>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">Actual Completion</span>
                      <div className="text-gray-900 font-medium mt-0.5">{formatDate(project.actualDate)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Show Details toggle */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {showDetails ? (
                  <>Hide Details <ChevronUp className="h-3.5 w-3.5" /></>
                ) : (
                  <>Show Details <ChevronDown className="h-3.5 w-3.5" /></>
                )}
              </button>

              {/* Details panel */}
              {showDetails && (
                <div className="border-t border-gray-200 px-10 py-6 space-y-5">
                  {/* Notes */}
                  {(project.projectedNotes || project.actualNotes) && (
                    <div className="space-y-3">
                      {project.projectedNotes && (
                        <div>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Projected Notes</span>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{project.projectedNotes}</p>
                        </div>
                      )}
                      {project.actualNotes && (
                        <div>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Actual Notes</span>
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{project.actualNotes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Department statuses */}
                  {deps.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Department Status</span>
                      <div className="mt-2 space-y-3">
                        {deps.map((ds) => {
                          const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
                          const hasContent = ds.roadblocks || ds.decisions;
                          return (
                            <div key={ds.id} className="flex items-start gap-3">
                              <span className={`inline-block h-3 w-3 rounded-full mt-0.5 flex-shrink-0 ${departmentStatusColor(ds.status)}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-sm font-medium text-gray-800">{ds.department}</span>
                                  {rep && <span className="text-xs text-gray-400">— {rep.full_name}</span>}
                                </div>
                                {ds.roadblocks && (
                                  <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{ds.roadblocks}</p>
                                )}
                                {ds.decisions && (
                                  <p className="text-xs text-blue-600 mt-1 whitespace-pre-wrap">Decision: {ds.decisions}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Asana link */}
                  {project.asana_link && (
                    <a
                      href={project.asana_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View in Asana
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

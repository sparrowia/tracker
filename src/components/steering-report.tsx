"use client";

import { useState, useMemo } from "react";
import { useRole } from "@/components/role-context";
import {
  steeringPhaseLabel,
  departmentStatusColor,
  departmentStatusLabel,
  formatDate,
  healthColor,
  healthLabel,
} from "@/lib/utils";
import type {
  Project,
  Person,
  ProjectDepartmentStatus,
  SteeringPhase,
  DepartmentStatusLevel,
  ProjectHealth,
} from "@/lib/types";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

const PHASE_TABS: SteeringPhase[] = [
  "in_progress",
  "post_launch",
  "upcoming",
  "on_hold",
  "completed",
  "parking_lot",
];

// Report owners who can see all projects (matched by name)
const REPORT_OWNER_NAMES = ["nader", "veronica"];

function isReportOwner(person: Person | null): boolean {
  if (!person) return false;
  const lower = person.full_name.toLowerCase();
  return REPORT_OWNER_NAMES.some((n) => lower.includes(n));
}

function deriveHealth(statuses: ProjectDepartmentStatus[]): ProjectHealth | null {
  const levels = statuses.map((d) => d.status).filter(Boolean) as DepartmentStatusLevel[];
  if (levels.length === 0) return null;
  if (levels.includes("red")) return "blocked";
  if (levels.includes("yellow")) return "at_risk";
  return "on_track";
}

interface SteeringReportProps {
  projects: Project[];
  people: Person[];
  deptStatuses: ProjectDepartmentStatus[];
}

export default function SteeringReport({ projects, people, deptStatuses }: SteeringReportProps) {
  const { role, userPersonId } = useRole();
  const [activeTab, setActiveTab] = useState<SteeringPhase>("in_progress");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const isAdmin = role === "super_admin" || role === "admin";
  const currentPerson = people.find((p) => p.id === userPersonId) ?? null;
  const isOwnerOfReport = isReportOwner(currentPerson);

  // Build dept statuses map by project_id
  const deptByProject = useMemo(() => {
    const map: Record<string, ProjectDepartmentStatus[]> = {};
    for (const ds of deptStatuses) {
      if (!map[ds.project_id]) map[ds.project_id] = [];
      map[ds.project_id].push(ds);
    }
    return map;
  }, [deptStatuses]);

  // Filter projects: only those with steering_phase set, and visible to the user
  const visibleProjects = useMemo(() => {
    return projects.filter((p) => {
      if (!p.steering_phase) return false;
      // Admins and report owners see all
      if (isAdmin || isOwnerOfReport) return true;
      // Project owner or sponsor sees their own
      if (userPersonId && (p.project_owner_id === userPersonId || p.executive_sponsor_id === userPersonId)) return true;
      return false;
    });
  }, [projects, isAdmin, isOwnerOfReport, userPersonId]);

  const tabProjects = visibleProjects
    .filter((p) => p.steering_phase === activeTab)
    .sort((a, b) => {
      if (a.steering_priority && b.steering_priority) return a.steering_priority - b.steering_priority;
      if (a.steering_priority) return -1;
      if (b.steering_priority) return 1;
      return a.name.localeCompare(b.name);
    });

  function toggleProject(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportToExcel() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    for (const phase of PHASE_TABS) {
      const phaseProjects = visibleProjects
        .filter((p) => p.steering_phase === phase)
        .sort((a, b) => {
          if (a.steering_priority && b.steering_priority) return a.steering_priority - b.steering_priority;
          if (a.steering_priority) return -1;
          if (b.steering_priority) return 1;
          return a.name.localeCompare(b.name);
        });
      if (phaseProjects.length === 0) continue;

      const rows: Record<string, string | number | null>[] = [];
      for (const proj of phaseProjects) {
        const sponsor = people.find((p) => p.id === proj.executive_sponsor_id);
        const deps = deptByProject[proj.id] || [];

        if (deps.length === 0) {
          rows.push({
            Project: proj.name,
            "Executive Sponsor": sponsor?.full_name ?? "",
            Priority: proj.steering_priority,
            "Original Completion Date": proj.original_completion_date ?? "",
            "Original Completion Notes": proj.original_completion_notes ?? "",
            "Actual Completion Date": proj.actual_completion_date ?? "",
            "Actual Completion Notes": proj.actual_completion_notes ?? "",
            Department: "",
            "Department Rep": "",
            Status: "",
            Roadblocks: "",
            Decisions: "",
          });
        } else {
          for (let i = 0; i < deps.length; i++) {
            const ds = deps[i];
            const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
            rows.push({
              Project: i === 0 ? proj.name : "",
              "Executive Sponsor": i === 0 ? (sponsor?.full_name ?? "") : "",
              Priority: i === 0 ? proj.steering_priority : null,
              "Original Completion Date": i === 0 ? (proj.original_completion_date ?? "") : "",
              "Original Completion Notes": i === 0 ? (proj.original_completion_notes ?? "") : "",
              "Actual Completion Date": i === 0 ? (proj.actual_completion_date ?? "") : "",
              "Actual Completion Notes": i === 0 ? (proj.actual_completion_notes ?? "") : "",
              Department: ds.department,
              "Department Rep": rep?.full_name ?? "",
              Status: ds.status ? (ds.status === "green" ? "Green" : ds.status === "yellow" ? "Yellow" : "Red") : "",
              Roadblocks: ds.roadblocks ?? "",
              Decisions: ds.decisions ?? "",
            });
          }
        }
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, steeringPhaseLabel(phase));
    }

    XLSX.writeFile(wb, "Steering_Committee_Report.xlsx");
  }

  if (!isAdmin && !isOwnerOfReport && visibleProjects.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-sm">You don&apos;t have access to the steering committee report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Steering Committee Report</h1>
        <button
          onClick={exportToExcel}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-gray-800 rounded hover:bg-gray-700"
        >
          <Download className="h-3.5 w-3.5" />
          Export to Excel
        </button>
      </div>

      {/* Phase tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {PHASE_TABS.map((phase) => {
          const count = visibleProjects.filter((p) => p.steering_phase === phase).length;
          return (
            <button
              key={phase}
              onClick={() => setActiveTab(phase)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === phase
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {steeringPhaseLabel(phase)}
              {count > 0 && (
                <span className="ml-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Project table */}
      {tabProjects.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No projects in this phase.
        </div>
      ) : (
        <div className="space-y-3">
          {tabProjects.map((proj) => {
            const sponsor = people.find((p) => p.id === proj.executive_sponsor_id);
            const deps = deptByProject[proj.id] || [];
            const isExpanded = expandedProjects.has(proj.id);
            const derivedHealth = deriveHealth(deps);
            const displayHealth = derivedHealth ?? proj.health;

            return (
              <div key={proj.id} className="border border-gray-300 rounded-lg overflow-hidden">
                {/* Project header row */}
                <button
                  onClick={() => toggleProject(proj.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 text-white hover:bg-gray-700 transition-colors text-left"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {proj.steering_priority && (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/20 text-[10px] font-bold flex-shrink-0">
                        {proj.steering_priority}
                      </span>
                    )}
                    <Link
                      href={`/projects/${proj.slug}`}
                      className="font-semibold truncate hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {proj.name}
                    </Link>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full border ${healthColor(displayHealth)}`}>
                      {healthLabel(displayHealth)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-300 flex-shrink-0">
                    {sponsor && <span>Sponsor: {sponsor.full_name}</span>}
                    {/* Traffic light summary */}
                    {deps.length > 0 && (
                      <div className="flex gap-1">
                        {deps.map((ds) => (
                          <span
                            key={ds.id}
                            className={`inline-block h-2.5 w-2.5 rounded-full ${departmentStatusColor(ds.status)}`}
                            title={`${ds.department}: ${departmentStatusLabel(ds.status)}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-gray-200">
                    {/* Project metadata */}
                    <div className="px-4 py-3 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      {proj.original_completion_date && (
                        <div>
                          <span className="font-medium text-gray-500">Orig. Target:</span>{" "}
                          <span className="text-gray-700">{formatDate(proj.original_completion_date)}</span>
                        </div>
                      )}
                      {proj.actual_completion_date && (
                        <div>
                          <span className="font-medium text-gray-500">Actual:</span>{" "}
                          <span className="text-gray-700">{formatDate(proj.actual_completion_date)}</span>
                        </div>
                      )}
                      {proj.original_completion_notes && (
                        <div className="col-span-2">
                          <span className="font-medium text-gray-500">Orig. Notes:</span>{" "}
                          <span className="text-gray-600 whitespace-pre-wrap">{proj.original_completion_notes}</span>
                        </div>
                      )}
                      {proj.actual_completion_notes && (
                        <div className="col-span-2">
                          <span className="font-medium text-gray-500">Actual Notes:</span>{" "}
                          <span className="text-gray-600 whitespace-pre-wrap">{proj.actual_completion_notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Department rows */}
                    {deps.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-300">
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[150px]">Department</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[120px]">Rep</th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 w-[70px]">Status</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Roadblocks</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Decisions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deps.map((ds) => {
                            const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
                            return (
                              <tr key={ds.id} className="border-b border-gray-200 last:border-b-0">
                                <td className="px-3 py-2 font-medium text-gray-700">{ds.department}</td>
                                <td className="px-3 py-2 text-gray-600">{rep?.full_name ?? "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span
                                    className={`inline-block h-3.5 w-3.5 rounded-full ${departmentStatusColor(ds.status)}`}
                                    title={departmentStatusLabel(ds.status)}
                                  />
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap">{ds.roadblocks || "—"}</td>
                                <td className="px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap">{ds.decisions || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="px-4 py-3 text-xs text-gray-400 italic">
                        No department statuses entered yet. Add them from the project page.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

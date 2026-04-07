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
  Initiative,
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

function sortByPriority<T extends { priority?: number | null; steering_priority?: number | null; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ap = a.priority ?? a.steering_priority;
    const bp = b.priority ?? b.steering_priority;
    if (ap && bp) return ap - bp;
    if (ap) return -1;
    if (bp) return 1;
    return a.name.localeCompare(b.name);
  });
}

// A report row can be an initiative (with child projects) or a standalone project
interface ReportRow {
  type: "initiative" | "project";
  id: string;
  name: string;
  slug: string;
  health: ProjectHealth;
  sponsorId: string | null;
  priority: number | null;
  phase: SteeringPhase | null;
  origDate: string | null;
  origNotes: string | null;
  actualDate: string | null;
  actualNotes: string | null;
  childProjects?: ReportRow[];
}

interface SteeringReportProps {
  projects: Project[];
  initiatives: Initiative[];
  people: Person[];
  deptStatuses: ProjectDepartmentStatus[];
}

export default function SteeringReport({ projects, initiatives, people, deptStatuses }: SteeringReportProps) {
  const { role, userPersonId } = useRole();
  const [activeTab, setActiveTab] = useState<SteeringPhase>("in_progress");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const isAdmin = role === "super_admin" || role === "admin";
  const currentPerson = people.find((p) => p.id === userPersonId) ?? null;
  const isOwnerOfReport = isReportOwner(currentPerson);

  // Dept statuses indexed by project_id and initiative_id
  const deptByEntity = useMemo(() => {
    const map: Record<string, ProjectDepartmentStatus[]> = {};
    for (const ds of deptStatuses) {
      const key = ds.project_id || ds.initiative_id;
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(ds);
    }
    return map;
  }, [deptStatuses]);

  function canSee(entity: { executive_sponsor_id?: string | null; project_owner_id?: string | null; owner_id?: string | null }): boolean {
    if (isAdmin || isOwnerOfReport) return true;
    if (userPersonId && (entity.project_owner_id === userPersonId || entity.owner_id === userPersonId || entity.executive_sponsor_id === userPersonId)) return true;
    return false;
  }

  // Build report rows: initiatives with children, then standalone projects
  const reportRows = useMemo(() => {
    const initiativeProjectIds = new Set<string>();
    const rows: ReportRow[] = [];

    // Initiatives that have a steering phase
    const steeringInitiatives = initiatives.filter((i) => i.steering_phase && canSee(i));
    for (const init of steeringInitiatives) {
      const childProjects = projects
        .filter((p) => p.initiative_id === init.id && canSee(p))
        .map((p) => {
          initiativeProjectIds.add(p.id);
          return {
            type: "project" as const,
            id: p.id,
            name: p.name,
            slug: p.slug,
            health: p.health,
            sponsorId: p.executive_sponsor_id,
            priority: p.steering_priority,
            phase: p.steering_phase,
            origDate: p.original_completion_date,
            origNotes: p.original_completion_notes,
            actualDate: p.actual_completion_date,
            actualNotes: p.actual_completion_notes,
          };
        });

      rows.push({
        type: "initiative",
        id: init.id,
        name: init.name,
        slug: init.slug,
        health: init.health,
        sponsorId: init.executive_sponsor_id,
        priority: init.steering_priority,
        phase: init.steering_phase,
        origDate: init.original_completion_date,
        origNotes: init.original_completion_notes,
        actualDate: init.actual_completion_date,
        actualNotes: init.actual_completion_notes,
        childProjects: sortByPriority(childProjects),
      });
    }

    // Also include projects under steering initiatives that have their own steering_phase
    // (already included as children above)

    // Standalone projects (not under a steering initiative)
    const standaloneProjects = projects.filter((p) => p.steering_phase && !initiativeProjectIds.has(p.id) && canSee(p));
    for (const p of standaloneProjects) {
      rows.push({
        type: "project",
        id: p.id,
        name: p.name,
        slug: p.slug,
        health: p.health,
        sponsorId: p.executive_sponsor_id,
        priority: p.steering_priority,
        phase: p.steering_phase,
        origDate: p.original_completion_date,
        origNotes: p.original_completion_notes,
        actualDate: p.actual_completion_date,
        actualNotes: p.actual_completion_notes,
      });
    }

    return rows;
  }, [projects, initiatives, isAdmin, isOwnerOfReport, userPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter by active tab — initiatives match by their own phase, standalone projects by theirs
  const tabRows = useMemo(() => {
    return sortByPriority(reportRows.filter((r) => r.phase === activeTab));
  }, [reportRows, activeTab]);

  // Count all visible items per tab (initiatives + standalone projects)
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const phase of PHASE_TABS) {
      counts[phase] = reportRows.filter((r) => r.phase === phase).length;
    }
    return counts;
  }, [reportRows]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
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
      const phaseRows = sortByPriority(reportRows.filter((r) => r.phase === phase));
      if (phaseRows.length === 0) continue;

      const excelRows: Record<string, string | number | null>[] = [];
      for (const row of phaseRows) {
        addExcelRows(excelRows, row, people, deptByEntity);
        if (row.childProjects) {
          for (const child of row.childProjects) {
            addExcelRows(excelRows, child, people, deptByEntity, true);
          }
        }
      }

      const ws = XLSX.utils.json_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, ws, steeringPhaseLabel(phase));
    }

    XLSX.writeFile(wb, "Steering_Committee_Report.xlsx");
  }

  if (!isAdmin && !isOwnerOfReport && reportRows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-sm">You don&apos;t have access to the steering committee report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      <div className="flex gap-1 border-b border-gray-200">
        {PHASE_TABS.map((phase) => (
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
            {tabCounts[phase] > 0 && (
              <span className="ml-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {tabCounts[phase]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabRows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">
          No items in this phase.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start" style={{ gridAutoRows: "1fr" }}>
          {tabRows.map((row, idx) => (
            <ReportCard
              key={row.id}
              row={row}
              index={idx}
              people={people}
              deptByEntity={deptByEntity}
              expandedIds={expandedIds}
              onToggle={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  row,
  index = 0,
  people,
  deptByEntity,
  expandedIds,
  onToggle,
  isChild,
}: {
  row: ReportRow;
  index?: number;
  people: Person[];
  deptByEntity: Record<string, ProjectDepartmentStatus[]>;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  isChild?: boolean;
}) {
  const sponsor = people.find((p) => p.id === row.sponsorId);
  const deps = deptByEntity[row.id] || [];
  const isExpanded = expandedIds.has(row.id);
  const derivedHealth = deriveHealth(deps);
  const displayHealth = derivedHealth ?? row.health;
  const isInitiative = row.type === "initiative";
  const href = isInitiative ? `/initiatives/${row.slug}` : `/projects/${row.slug}`;

  return (
    <div className={isChild ? "" : ""}>
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white hover:border-gray-400 transition-colors h-full flex flex-col">
        {/* Card header */}
        <button
          onClick={() => onToggle(row.id)}
          className="w-full text-left px-4 py-3 bg-gray-100 hover:bg-gray-150 transition-colors border-b border-gray-200"
        >
          <div className="flex items-center gap-2 mb-1.5">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />}
            {row.priority && (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex-shrink-0">
                {row.priority}
              </span>
            )}
            {isInitiative && (
              <span className="inline-flex px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-100 text-amber-800 border border-amber-300 flex-shrink-0">
                INITIATIVE
              </span>
            )}
            <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full border ${healthColor(displayHealth)}`}>
              {healthLabel(displayHealth)}
            </span>
            {/* Traffic light dots */}
            {deps.length > 0 && (
              <div className="flex gap-1 ml-auto">
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
          <Link
            href={href}
            className="text-sm font-semibold text-gray-900 hover:text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name}
          </Link>
          {sponsor && (
            <div className="text-xs text-gray-500 mt-1">Sponsor: {sponsor.full_name}</div>
          )}
        </button>

        {isExpanded && (
          <div className="divide-y divide-gray-200">
            {/* Metadata */}
            {(row.origDate || row.actualDate || row.origNotes || row.actualNotes) && (
              <div className="px-4 py-3 bg-gray-50 grid grid-cols-2 gap-3 text-xs">
                {row.origDate && (
                  <div>
                    <span className="font-medium text-gray-500">Orig. Target:</span>{" "}
                    <span className="text-gray-700">{formatDate(row.origDate)}</span>
                  </div>
                )}
                {row.actualDate && (
                  <div>
                    <span className="font-medium text-gray-500">Actual:</span>{" "}
                    <span className="text-gray-700">{formatDate(row.actualDate)}</span>
                  </div>
                )}
                {row.origNotes && (
                  <div className="col-span-2">
                    <span className="font-medium text-gray-500">Orig. Notes:</span>{" "}
                    <span className="text-gray-600 whitespace-pre-wrap">{row.origNotes}</span>
                  </div>
                )}
                {row.actualNotes && (
                  <div className="col-span-2">
                    <span className="font-medium text-gray-500">Actual Notes:</span>{" "}
                    <span className="text-gray-600 whitespace-pre-wrap">{row.actualNotes}</span>
                  </div>
                )}
              </div>
            )}

            {/* Department list */}
            {deps.length > 0 ? (
              <div className="px-4 py-3 space-y-2">
                {deps.map((ds) => {
                  const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
                  return (
                    <div key={ds.id} className="flex items-start gap-2 text-xs">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full mt-0.5 flex-shrink-0 ${departmentStatusColor(ds.status)}`}
                        title={departmentStatusLabel(ds.status)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-700">{ds.department}</span>
                        {rep && <span className="text-gray-400 ml-1">— {rep.full_name}</span>}
                        {ds.roadblocks && (
                          <div className="text-gray-500 mt-0.5 whitespace-pre-wrap">{ds.roadblocks}</div>
                        )}
                        {ds.decisions && (
                          <div className="text-blue-600 mt-0.5 whitespace-pre-wrap">Decision: {ds.decisions}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-3 text-xs text-gray-400 italic">
                No department statuses entered yet.
              </div>
            )}

            {/* Child projects under initiative */}
            {isInitiative && row.childProjects && row.childProjects.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Projects</div>
                {row.childProjects.map((child) => {
                  const childDeps = deptByEntity[child.id] || [];
                  const childHealth = deriveHealth(childDeps) ?? child.health;
                  return (
                    <div key={child.id} className="flex items-center gap-2">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${healthColor(childHealth)}`}>
                        {healthLabel(childHealth)}
                      </span>
                      <Link
                        href={`/projects/${child.slug}`}
                        className="text-xs font-medium text-gray-700 hover:text-blue-600 hover:underline"
                      >
                        {child.name}
                      </Link>
                      {childDeps.length > 0 && (
                        <div className="flex gap-0.5 ml-auto">
                          {childDeps.map((ds) => (
                            <span
                              key={ds.id}
                              className={`inline-block h-2 w-2 rounded-full ${departmentStatusColor(ds.status)}`}
                              title={`${ds.department}: ${departmentStatusLabel(ds.status)}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function addExcelRows(
  rows: Record<string, string | number | null>[],
  row: ReportRow,
  people: Person[],
  deptByEntity: Record<string, ProjectDepartmentStatus[]>,
  isChild?: boolean,
) {
  const sponsor = people.find((p) => p.id === row.sponsorId);
  const deps = deptByEntity[row.id] || [];
  const prefix = isChild ? "  ↳ " : "";

  if (deps.length === 0) {
    rows.push({
      Item: prefix + row.name,
      Type: row.type === "initiative" ? "Initiative" : "Project",
      "Executive Sponsor": sponsor?.full_name ?? "",
      Priority: row.priority,
      "Original Completion Date": row.origDate ?? "",
      "Original Completion Notes": row.origNotes ?? "",
      "Actual Completion Date": row.actualDate ?? "",
      "Actual Completion Notes": row.actualNotes ?? "",
      Department: "",
      "Department Owner": "",
      Status: "",
      Roadblocks: "",
      Decisions: "",
    });
  } else {
    for (let i = 0; i < deps.length; i++) {
      const ds = deps[i];
      const rep = ds.rep ?? people.find((p) => p.id === ds.rep_person_id);
      rows.push({
        Item: i === 0 ? prefix + row.name : "",
        Type: i === 0 ? (row.type === "initiative" ? "Initiative" : "Project") : "",
        "Executive Sponsor": i === 0 ? (sponsor?.full_name ?? "") : "",
        Priority: i === 0 ? row.priority : null,
        "Original Completion Date": i === 0 ? (row.origDate ?? "") : "",
        "Original Completion Notes": i === 0 ? (row.origNotes ?? "") : "",
        "Actual Completion Date": i === 0 ? (row.actualDate ?? "") : "",
        "Actual Completion Notes": i === 0 ? (row.actualNotes ?? "") : "",
        Department: ds.department,
        "Department Owner": rep?.full_name ?? "",
        Status: ds.status ? (ds.status === "green" ? "Green" : ds.status === "yellow" ? "Yellow" : "Red") : "",
        Roadblocks: ds.roadblocks ?? "",
        Decisions: ds.decisions ?? "",
      });
    }
  }
}

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import OwnerPicker from "@/components/owner-picker";
import {
  steeringPhaseLabel,
  departmentStatusColor,
  departmentStatusLabel,
  formatDate,
} from "@/lib/utils";
import type {
  Project,
  Initiative,
  Person,
  SteeringPhase,
  DepartmentStatusLevel,
  ProjectDepartmentStatus,
  ProjectHealth,
} from "@/lib/types";
import { STEERING_DEPARTMENTS } from "@/lib/types";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

const PHASE_OPTIONS: SteeringPhase[] = [
  "in_progress",
  "post_launch",
  "parking_lot",
  "upcoming",
  "completed",
  "on_hold",
];

const STATUS_OPTIONS: (DepartmentStatusLevel | "none")[] = ["green", "yellow", "red", "none"];

// Common shape for both project and initiative
interface SteeringEntity {
  id: string;
  org_id: string;
  executive_sponsor_id: string | null;
  steering_priority: number | null;
  steering_phase: SteeringPhase | null;
  original_completion_date: string | null;
  original_completion_notes: string | null;
  actual_completion_date: string | null;
  actual_completion_notes: string | null;
  product_type?: string | null; // only on projects
  asana_link?: string | null; // only on projects
  project_owner_id?: string | null; // only on projects
  owner_id?: string | null; // only on initiatives
}

interface SteeringCommitteeSectionProps {
  entity: SteeringEntity;
  entityType: "project" | "initiative";
  tableName: string; // "projects" or "initiatives"
  people: Person[];
  onHealthOverride?: (health: ProjectHealth | null) => void;
  onEntityUpdate: (updates: Record<string, unknown>) => void;
}

export default function SteeringCommitteeSection({
  entity,
  entityType,
  tableName,
  people: initialPeople,
  onHealthOverride,
  onEntityUpdate,
}: SteeringCommitteeSectionProps) {
  const supabase = createClient();
  const { role, userPersonId } = useRole();
  const [expanded, setExpanded] = useState(false);
  const [people, setPeople] = useState(initialPeople);
  const [deptStatuses, setDeptStatuses] = useState<ProjectDepartmentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Local state for steering fields
  const [sponsorId, setSponsorId] = useState(entity.executive_sponsor_id);
  const [priority, setPriority] = useState<number | "">(entity.steering_priority ?? "");
  const [phase, setPhase] = useState<SteeringPhase | "">(entity.steering_phase ?? "");
  const [origDate, setOrigDate] = useState(entity.original_completion_date ?? "");
  const [origNotes, setOrigNotes] = useState(entity.original_completion_notes ?? "");
  const [actualDate, setActualDate] = useState(entity.actual_completion_date ?? "");
  const [actualNotes, setActualNotes] = useState(entity.actual_completion_notes ?? "");
  const [productType, setProductType] = useState(entity.product_type ?? "");
  const [asanaLink, setAsanaLink] = useState(entity.asana_link ?? "");

  // Visibility: project owner, initiative owner, executive sponsor, or admin
  const isOwner = userPersonId && (entity.project_owner_id === userPersonId || entity.owner_id === userPersonId);
  const isSponsor = userPersonId && entity.executive_sponsor_id === userPersonId;
  const isAdminRole = role === "super_admin" || role === "admin";
  const canView = isOwner || isSponsor || isAdminRole;

  const filterCol = entityType === "project" ? "project_id" : "initiative_id";

  useEffect(() => {
    if (!canView) return;
    supabase
      .from("project_department_statuses")
      .select("*, rep:people(*)")
      .eq(filterCol, entity.id)
      .order("sort_order")
      .then(({ data }) => {
        setDeptStatuses((data || []) as ProjectDepartmentStatus[]);
        setLoading(false);
      });
  }, [entity.id, canView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Health override: derive from department statuses (projects only)
  useEffect(() => {
    if (!onHealthOverride) return;
    if (deptStatuses.length === 0) {
      onHealthOverride(null);
      return;
    }
    const statuses = deptStatuses.map((d) => d.status).filter(Boolean) as DepartmentStatusLevel[];
    if (statuses.length === 0) {
      onHealthOverride(null);
      return;
    }
    if (statuses.includes("red")) {
      onHealthOverride("blocked");
    } else if (statuses.includes("yellow")) {
      onHealthOverride("at_risk");
    } else {
      onHealthOverride("on_track");
    }
  }, [deptStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canView) return null;

  function saveField(field: string, value: unknown) {
    supabase
      .from(tableName)
      .update({ [field]: value === "" ? null : value })
      .eq("id", entity.id)
      .then(() => {});
    onEntityUpdate({ [field]: value === "" ? null : value });
  }

  async function addDepartment(dept: string) {
    const existing = deptStatuses.find((d) => d.department === dept);
    if (existing) return;
    const maxSort = deptStatuses.length > 0 ? Math.max(...deptStatuses.map((d) => d.sort_order)) : -1;
    const parentCol = entityType === "project" ? "project_id" : "initiative_id";
    const { data, error } = await supabase
      .from("project_department_statuses")
      .insert({
        org_id: entity.org_id,
        [parentCol]: entity.id,
        department: dept,
        sort_order: maxSort + 1,
      })
      .select("*, rep:people(*)")
      .single();
    if (!error && data) {
      setDeptStatuses((prev) => [...prev, data as ProjectDepartmentStatus]);
    }
  }

  function updateDeptField(id: string, field: string, value: unknown) {
    supabase
      .from("project_department_statuses")
      .update({ [field]: value === "none" ? null : value === "" ? null : value })
      .eq("id", id)
      .then(() => {});
    setDeptStatuses((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, [field]: value === "none" ? null : value === "" ? null : value } : d
      )
    );
  }

  async function removeDepartment(id: string) {
    await supabase.from("project_department_statuses").delete().eq("id", id);
    setDeptStatuses((prev) => prev.filter((d) => d.id !== id));
  }

  const unusedDepts = STEERING_DEPARTMENTS.filter(
    (d) => !deptStatuses.some((ds) => ds.department === d)
  );

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-xs font-semibold uppercase tracking-wide hover:bg-gray-700 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Steering Committee
      </button>

      {expanded && (
        <div className="p-4 space-y-4 bg-white">
          {loading ? (
            <div className="text-sm text-gray-400">Loading...</div>
          ) : (
            <>
              {/* Project-level steering fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Executive Sponsor</label>
                  <OwnerPicker
                    value={sponsorId || ""}
                    onChange={(id) => {
                      setSponsorId(id || null);
                      saveField("executive_sponsor_id", id || null);
                    }}
                    people={people}
                    onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Steering Phase</label>
                  <select
                    value={phase}
                    onChange={(e) => {
                      const v = e.target.value as SteeringPhase | "";
                      setPhase(v);
                      saveField("steering_phase", v || null);
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">— Select Phase —</option>
                    {PHASE_OPTIONS.map((p) => (
                      <option key={p} value={p}>{steeringPhaseLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Steering Priority</label>
                  <input
                    type="number"
                    min={1}
                    value={priority}
                    onChange={(e) => {
                      const v = e.target.value === "" ? "" : parseInt(e.target.value);
                      setPriority(v);
                    }}
                    onBlur={() => saveField("steering_priority", priority === "" ? null : priority)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="1, 2, 3..."
                  />
                </div>
                {entityType === "project" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Product Type</label>
                    <input
                      type="text"
                      value={productType}
                      onChange={(e) => setProductType(e.target.value)}
                      onBlur={() => saveField("product_type", productType)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. Thought Industries, BenchPrep..."
                    />
                  </div>
                )}
                {entityType !== "project" && <div />}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Projected Completion Date</label>
                  <input
                    type="date"
                    value={origDate}
                    onChange={(e) => {
                      setOrigDate(e.target.value);
                      saveField("original_completion_date", e.target.value || null);
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Actual Completion Date</label>
                  <input
                    type="date"
                    value={actualDate}
                    onChange={(e) => {
                      setActualDate(e.target.value);
                      saveField("actual_completion_date", e.target.value || null);
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Projected Completion Notes</label>
                  <textarea
                    value={origNotes}
                    onChange={(e) => setOrigNotes(e.target.value)}
                    onBlur={() => saveField("original_completion_notes", origNotes)}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                    placeholder="Timeline context..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Actual Completion Notes</label>
                  <textarea
                    value={actualNotes}
                    onChange={(e) => setActualNotes(e.target.value)}
                    onBlur={() => saveField("actual_completion_notes", actualNotes)}
                    rows={4}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                    placeholder="Actual completion context..."
                  />
                </div>
                {entityType === "project" && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Asana Link</label>
                    <input
                      type="url"
                      value={asanaLink}
                      onChange={(e) => setAsanaLink(e.target.value)}
                      onBlur={() => saveField("asana_link", asanaLink)}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="https://app.asana.com/..."
                    />
                  </div>
                )}
              </div>

              {/* Department statuses — card layout */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Department Status</h3>
                </div>
                {deptStatuses.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {deptStatuses.map((ds) => (
                      <DepartmentCard
                        key={ds.id}
                        ds={ds}
                        people={people}
                        onUpdate={updateDeptField}
                        onRemove={removeDepartment}
                        onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
                      />
                    ))}
                  </div>
                )}

                {/* Add department */}
                {unusedDepts.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      id="add-dept-select"
                      defaultValue=""
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="" disabled>Add department...</option>
                      {unusedDepts.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const sel = document.getElementById("add-dept-select") as HTMLSelectElement;
                        if (sel.value) {
                          addDepartment(sel.value);
                          sel.value = "";
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-gray-800 rounded hover:bg-gray-700"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DepartmentCard({
  ds,
  people,
  onUpdate,
  onRemove,
  onPersonAdded,
}: {
  ds: ProjectDepartmentStatus;
  people: Person[];
  onUpdate: (id: string, field: string, value: unknown) => void;
  onRemove: (id: string) => void;
  onPersonAdded: (person: Person) => void;
}) {
  const [roadblocks, setRoadblocks] = useState(ds.roadblocks ?? "");
  const [decisions, setDecisions] = useState(ds.decisions ?? "");
  const [editingRoadblocks, setEditingRoadblocks] = useState(false);
  const [editingDecisions, setEditingDecisions] = useState(false);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Card header — department name + traffic light + delete */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full flex-shrink-0 ${departmentStatusColor(ds.status)}`} title={departmentStatusLabel(ds.status)} />
          <span className="text-sm font-semibold text-white">{ds.department}</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={ds.status ?? "none"}
            onChange={(e) => onUpdate(ds.id, "status", e.target.value)}
            className="rounded border border-gray-600 px-1.5 py-0.5 text-xs focus:border-blue-400 focus:outline-none bg-gray-700 text-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "none" ? "No Status" : s === "green" ? "On Time" : s === "yellow" ? "Delayed" : "Blocked"}
              </option>
            ))}
          </select>
          <button
            onClick={() => onRemove(ds.id)}
            className="text-gray-400 hover:text-red-400 p-0.5"
            title="Remove department"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 bg-white">
        {/* Rep */}
        <div>
          <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide mb-1">Owner</label>
          <OwnerPicker
            value={ds.rep_person_id || ""}
            onChange={(id) => onUpdate(ds.id, "rep_person_id", id || null)}
            people={people}
            onPersonAdded={onPersonAdded}
          />
        </div>

        {/* Roadblocks */}
        <div>
          <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide mb-1">Roadblocks</label>
          {editingRoadblocks ? (
            <textarea
              value={roadblocks}
              onChange={(e) => setRoadblocks(e.target.value)}
              onBlur={() => {
                onUpdate(ds.id, "roadblocks", roadblocks);
                setEditingRoadblocks(false);
              }}
              autoFocus
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none resize-y"
            />
          ) : (
            <div
              onClick={() => setEditingRoadblocks(true)}
              className="text-xs text-gray-600 cursor-pointer hover:bg-gray-50 rounded border border-transparent hover:border-gray-200 px-2 py-1.5 min-h-[36px] whitespace-pre-wrap"
            >
              {ds.roadblocks || <span className="text-gray-400 italic">Click to add...</span>}
            </div>
          )}
        </div>

        {/* Decisions */}
        <div>
          <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide mb-1">Decisions</label>
          {editingDecisions ? (
            <textarea
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              onBlur={() => {
                onUpdate(ds.id, "decisions", decisions);
                setEditingDecisions(false);
              }}
              autoFocus
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none resize-y"
            />
          ) : (
            <div
              onClick={() => setEditingDecisions(true)}
              className="text-xs text-gray-600 cursor-pointer hover:bg-gray-50 rounded border border-transparent hover:border-gray-200 px-2 py-1.5 min-h-[36px] whitespace-pre-wrap"
            >
              {ds.decisions || <span className="text-gray-400 italic">Click to add...</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

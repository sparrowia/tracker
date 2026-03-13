"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import OwnerPicker from "@/components/owner-picker";
import AddProjectButton from "@/components/add-project-button";
import AddInitiativeButton from "@/components/add-initiative-button";
import { cn, milestoneTypeLabel, milestoneTypeColor, milestoneStatusLabel, milestoneStatusColor, healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import { canCreate, canDelete } from "@/lib/permissions";
import type { Milestone, MilestoneType, MilestoneStatus, Person, Project, Initiative, UserRole } from "@/lib/types";
import { Trash2 } from "lucide-react";

const MILESTONE_TYPES: MilestoneType[] = ["project", "initiative", "proposed_project", "proposed_initiative"];
const MILESTONE_STATUSES: MilestoneStatus[] = ["pending", "in_progress", "complete"];

function getQuarterLabel(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${q} ${date.getFullYear()}`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long" });
}

function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

interface GroupedMilestones {
  quarter: string;
  months: { month: string; milestones: Milestone[] }[];
}

function groupByQuarterMonth(milestones: Milestone[]): GroupedMilestones[] {
  // Only group top-level milestones (no parent_id)
  const topLevel = milestones.filter((m) => !m.parent_id);
  const sorted = [...topLevel].sort((a, b) => a.target_date.localeCompare(b.target_date));
  const groups: GroupedMilestones[] = [];
  let currentQuarter = "";
  let currentMonth = "";
  let currentGroup: GroupedMilestones | null = null;
  let currentMonthGroup: { month: string; milestones: Milestone[] } | null = null;

  for (const m of sorted) {
    const date = parseDate(m.target_date);
    const q = getQuarterLabel(date);
    const mo = getMonthLabel(date);

    if (q !== currentQuarter) {
      currentGroup = { quarter: q, months: [] };
      groups.push(currentGroup);
      currentQuarter = q;
      currentMonth = "";
    }

    if (mo !== currentMonth) {
      currentMonthGroup = { month: mo, milestones: [] };
      currentGroup!.months.push(currentMonthGroup);
      currentMonth = mo;
    }

    currentMonthGroup!.milestones.push(m);
  }

  return groups;
}

export default function TimelinePage() {
  const supabase = createClient();
  const { role, profileId, orgId } = useRole();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedChildren, setExpandedChildren] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", target_date: "", milestone_type: "proposed_project" as MilestoneType, description: "" });
  const [saving, setSaving] = useState(false);

  // "Create from proposed" state
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"project" | "initiative" | null>(null);

  const load = useCallback(async () => {
    const [{ data: mData }, { data: pData }, { data: projData }, { data: initData }] = await Promise.all([
      supabase.from("milestones").select("*, owner:people(id, full_name), project:projects(id, name, slug, health), initiative:initiatives(id, name, slug, health)").order("target_date"),
      supabase.from("people").select("*").order("full_name"),
      supabase.from("projects").select("id, name, slug, health").order("name"),
      supabase.from("initiatives").select("id, name, slug, health").order("name"),
    ]);
    setMilestones((mData || []) as Milestone[]);
    setPeople((pData || []) as Person[]);
    setProjects((projData || []) as Project[]);
    setInitiatives((initData || []) as Initiative[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getChildren(parentId: string): Milestone[] {
    return milestones
      .filter((m) => m.parent_id === parentId)
      .sort((a, b) => a.target_date.localeCompare(b.target_date));
  }

  function toggleChildren(id: string) {
    setExpandedChildren((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addMilestone() {
    if (!addForm.title.trim() || !addForm.target_date || saving) return;
    setSaving(true);
    await supabase.from("milestones").insert({
      org_id: orgId,
      title: addForm.title.trim(),
      target_date: addForm.target_date,
      milestone_type: addForm.milestone_type,
      description: addForm.description.trim() || null,
      created_by: profileId,
    });
    setSaving(false);
    setShowAdd(false);
    setAddForm({ title: "", target_date: "", milestone_type: "proposed_project", description: "" });
    load();
  }

  async function updateField(id: string, field: string, value: string | null) {
    await supabase.from("milestones").update({ [field]: value }).eq("id", id).then(() => {});
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  }

  async function deleteMilestone(id: string) {
    await supabase.from("milestones").delete().eq("id", id).then(() => {});
    setMilestones((prev) => prev.filter((m) => m.id !== id && m.parent_id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleCreateFromProposed(milestone: Milestone) {
    const targetType = milestone.milestone_type === "proposed_project" ? "project" : "initiative";
    setCreateType(targetType);
    setCreatingFrom(milestone.id);
  }

  async function handleEntityCreated(milestoneId: string, entityType: "project" | "initiative", entityId: string) {
    const updates: Record<string, string> = { milestone_type: entityType };
    if (entityType === "project") {
      updates.project_id = entityId;
    } else {
      updates.initiative_id = entityId;
    }
    await supabase.from("milestones").update(updates).eq("id", milestoneId).then(() => {});
    // Also update children to match
    const children = getChildren(milestoneId);
    for (const c of children) {
      await supabase.from("milestones").update(updates).eq("id", c.id).then(() => {});
    }
    setCreatingFrom(null);
    setCreateType(null);
    load();
    window.dispatchEvent(new Event("sidebar:refresh"));
  }

  const isProposed = (type: MilestoneType) => type === "proposed_project" || type === "proposed_initiative";

  const grouped = groupByQuarterMonth(milestones);

  if (loading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-48" />
          <div className="h-6 bg-gray-100 rounded w-full" />
          <div className="h-6 bg-gray-100 rounded w-full" />
        </div>
      </div>
    );
  }

  const creatingMilestone = creatingFrom ? milestones.find((m) => m.id === creatingFrom) : null;

  return (
    <div className="flex-1 p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between bg-gray-800 text-white px-4 py-2.5 rounded-t-md">
        <h1 className="text-sm font-semibold uppercase tracking-wider">Timeline</h1>
        {canCreate(role) && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs font-medium text-white hover:text-gray-300"
          >
            + Add Milestone
          </button>
        )}
      </div>

      {/* Inline add form */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 border-t-0 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
              <input
                type="text"
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") addMilestone(); if (e.key === "Escape") setShowAdd(false); }}
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Target Date</label>
              <input
                type="date"
                value={addForm.target_date}
                onChange={(e) => setAddForm({ ...addForm, target_date: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select
                value={addForm.milestone_type}
                onChange={(e) => setAddForm({ ...addForm, milestone_type: e.target.value as MilestoneType })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {MILESTONE_TYPES.map((t) => (
                  <option key={t} value={t}>{milestoneTypeLabel(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input
                type="text"
                value={addForm.description}
                onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addMilestone}
              disabled={saving || !addForm.title.trim() || !addForm.target_date}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Helper text */}
      <div className="border border-t-0 border-gray-300 border-b-0 bg-white px-4 py-1.5">
        <span className="text-xs text-gray-400">Click on a proposed project pill to create a new project from it</span>
      </div>

      {/* Timeline content */}
      <div className="border border-t-0 border-gray-300 rounded-b-md bg-white">
        {grouped.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No milestones yet. Click &quot;+ Add Milestone&quot; to create one.
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.quarter}>
            {/* Quarter header */}
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-300">
              <span className="text-sm font-bold text-gray-700">{group.quarter}</span>
            </div>

            {group.months.map((monthGroup) => (
              <div key={monthGroup.month}>
                {/* Month divider */}
                <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-200">
                  <div className="h-px flex-1 bg-gray-300" />
                  <span className="text-xs font-medium text-gray-500 uppercase">{monthGroup.month}</span>
                  <div className="h-px flex-1 bg-gray-300" />
                </div>

                {/* Milestone rows */}
                {monthGroup.milestones.map((m) => {
                  const proposed = isProposed(m.milestone_type);
                  const complete = m.status === "complete";
                  const expanded = expandedId === m.id;
                  const linkedHealth = m.project?.health || m.initiative?.health;
                  const dateStr = formatDateShort(m.target_date);
                  const children = getChildren(m.id);
                  const hasChildren = children.length > 0;
                  const childrenOpen = expandedChildren.has(m.id);

                  return (
                    <div key={m.id} className={cn(
                      "border-b border-gray-200",
                      complete ? "" : proposed ? "bg-gray-50/50" : (m.milestone_type === "project" || m.milestone_type === "initiative") && "bg-yellow-50/60"
                    )}>
                      {/* Parent row */}
                      <div
                        className={cn("flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors", complete ? "opacity-50 hover:opacity-70" : proposed ? "hover:bg-gray-50" : "hover:bg-yellow-50")}
                        onClick={() => setExpandedId(expanded ? null : m.id)}
                      >
                        {/* Disclosure triangle for parents with children */}
                        {hasChildren ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleChildren(m.id); }}
                            className="text-gray-400 hover:text-gray-600 flex-shrink-0 w-4 text-center"
                          >
                            <span className={cn("inline-block transition-transform text-xs", childrenOpen ? "rotate-90" : "")}>&#9654;</span>
                          </button>
                        ) : (
                          <span className="w-4 flex-shrink-0" />
                        )}

                        {/* Dot */}
                        <span className={cn(
                          "w-2.5 h-2.5 rounded-full flex-shrink-0",
                          complete ? "bg-green-500" : proposed ? "border-2 border-dashed border-gray-400" : "bg-gray-700"
                        )} />

                        {/* Date */}
                        <span className={cn("text-xs w-16 flex-shrink-0 font-medium", complete ? "text-gray-400" : "text-gray-500")}>{dateStr}</span>

                        {/* Title */}
                        <span className={cn("text-sm font-semibold flex-1 truncate", complete ? "text-gray-400" : proposed ? "text-gray-500" : "")}>
                          {m.title}
                          {hasChildren && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400">({children.length})</span>
                          )}
                        </span>

                        {/* Type badge — proposed pills are clickable to create */}
                        {proposed && canCreate(role) ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCreateFromProposed(m); }}
                            className={cn("text-xs px-2 py-0.5 rounded-full border flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity", milestoneTypeColor(m.milestone_type))}
                          >
                            {milestoneTypeLabel(m.milestone_type)}
                          </button>
                        ) : (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border flex-shrink-0", milestoneTypeColor(m.milestone_type))}>
                            {milestoneTypeLabel(m.milestone_type)}
                          </span>
                        )}

                        {/* Health badge (for linked entities) */}
                        {linkedHealth && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border flex-shrink-0", healthColor(linkedHealth))}>
                            {healthLabel(linkedHealth)}
                          </span>
                        )}

                        {/* Status badge — hidden for proposed */}
                        {!proposed && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full flex-shrink-0", milestoneStatusColor(m.status))}>
                            {milestoneStatusLabel(m.status)}
                          </span>
                        )}

                        {/* Owner */}
                        {m.owner && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                              {m.owner.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-xs text-gray-600 hidden lg:inline">{m.owner.full_name}</span>
                          </div>
                        )}
                      </div>

                      {/* Expanded detail panel */}
                      {expanded && (
                        <MilestoneDetail
                          milestone={m}
                          people={people}
                          projects={projects}
                          initiatives={initiatives}
                          role={role}
                          onUpdate={updateField}
                          onDelete={deleteMilestone}
                          onPersonAdded={(p) => setPeople((prev) => [...prev, p])}
                          onReload={load}
                        />
                      )}

                      {/* Children rows */}
                      {hasChildren && childrenOpen && children.map((child) => {
                        const childProposed = isProposed(child.milestone_type);
                        const childComplete = child.status === "complete";
                        const childExpanded = expandedId === child.id;
                        const childDateStr = formatDateShort(child.target_date);

                        return (
                          <div key={child.id} className="border-t border-gray-100">
                            <div
                              className={cn("flex items-center gap-3 pl-10 pr-4 py-2 cursor-pointer transition-colors", childComplete ? "opacity-50 hover:opacity-70" : childProposed ? "hover:bg-gray-50" : "hover:bg-yellow-50/50")}
                              onClick={() => setExpandedId(childExpanded ? null : child.id)}
                            >
                              {/* Arrow indent */}
                              <span className="text-gray-300 text-xs flex-shrink-0">&#8627;</span>

                              {/* Dot */}
                              <span className={cn(
                                "w-2 h-2 rounded-full flex-shrink-0",
                                childComplete ? "bg-green-500" : childProposed ? "border border-dashed border-gray-400" : "bg-gray-500"
                              )} />

                              {/* Date */}
                              <span className={cn("text-xs w-16 flex-shrink-0", childComplete ? "text-gray-400" : "text-gray-400")}>{childDateStr}</span>

                              {/* Title */}
                              <span className={cn("text-sm flex-1 truncate", childComplete ? "text-gray-400" : childProposed ? "text-gray-400" : "text-gray-600")}>{child.title}</span>

                              {/* Status — hidden for proposed */}
                              {!childProposed && (
                                <span className={cn("text-xs px-2 py-0.5 rounded-full flex-shrink-0", milestoneStatusColor(child.status))}>
                                  {milestoneStatusLabel(child.status)}
                                </span>
                              )}
                            </div>

                            {/* Child detail panel */}
                            {childExpanded && (
                              <MilestoneDetail
                                milestone={child}
                                people={people}
                                projects={projects}
                                initiatives={initiatives}
                                role={role}
                                onUpdate={updateField}
                                onDelete={deleteMilestone}
                                onPersonAdded={(p) => setPeople((prev) => [...prev, p])}
                                onReload={load}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Hidden create modals for "Create from proposed" */}
      {creatingFrom && creatingMilestone && createType === "project" && (
        <div className="hidden">
          <AddProjectButton
            openExternal
            defaultValues={{
              name: creatingMilestone.title,
              description: creatingMilestone.description || undefined,
              target_completion: creatingMilestone.target_date,
            }}
            onCreated={(id) => handleEntityCreated(creatingFrom, "project", id)}
            onSaved={() => { setCreatingFrom(null); setCreateType(null); }}
          />
        </div>
      )}
      {creatingFrom && creatingMilestone && createType === "initiative" && (
        <div className="hidden">
          <AddInitiativeButton
            openExternal
            defaultValues={{
              name: creatingMilestone.title,
              description: creatingMilestone.description || undefined,
              target_completion: creatingMilestone.target_date,
            }}
            onCreated={(id) => handleEntityCreated(creatingFrom, "initiative", id)}
            onSaved={() => { setCreatingFrom(null); setCreateType(null); }}
          />
        </div>
      )}
    </div>
  );
}

function MilestoneDetail({
  milestone: m,
  people,
  projects,
  initiatives,
  role,
  onUpdate,
  onDelete,
  onPersonAdded,
  onReload,
}: {
  milestone: Milestone;
  people: Person[];
  projects: Project[];
  initiatives: Initiative[];
  role: UserRole;
  onUpdate: (id: string, field: string, value: string | null) => void;
  onDelete: (id: string) => void;
  onPersonAdded: (p: Person) => void;
  onReload: () => void;
}) {
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [desc, setDesc] = useState(m.description || "");
  const [editDesc, setEditDesc] = useState(false);
  const proposed = m.milestone_type === "proposed_project" || m.milestone_type === "proposed_initiative";

  return (
    <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-200">
      {/* Editable title */}
      <div className="mb-3">
        {editTitle ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { onUpdate(m.id, "title", title); setEditTitle(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { onUpdate(m.id, "title", title); setEditTitle(false); } if (e.key === "Escape") { setTitle(m.title); setEditTitle(false); } }}
            autoFocus
            className="text-base font-bold text-yellow-700 bg-transparent border-b border-yellow-400 focus:outline-none w-full"
          />
        ) : (
          <h3
            className="text-base font-bold text-yellow-700 cursor-pointer hover:underline"
            onClick={() => setEditTitle(true)}
          >
            {m.title}
          </h3>
        )}
      </div>

      {/* Property grid */}
      <div className="grid grid-cols-[120px_1fr_120px_1fr] gap-y-2 gap-x-4 text-sm mb-3">
        <span className="text-gray-500 font-medium">Type</span>
        <select
          value={m.milestone_type}
          onChange={(e) => onUpdate(m.id, "milestone_type", e.target.value)}
          className="rounded border border-gray-200 px-2 py-0.5 text-sm"
        >
          {MILESTONE_TYPES.map((t) => (
            <option key={t} value={t}>{milestoneTypeLabel(t)}</option>
          ))}
        </select>

        {!proposed && (
          <>
            <span className="text-gray-500 font-medium">Status</span>
            <select
              value={m.status}
              onChange={(e) => onUpdate(m.id, "status", e.target.value)}
              className="rounded border border-gray-200 px-2 py-0.5 text-sm"
            >
              {MILESTONE_STATUSES.map((s) => (
                <option key={s} value={s}>{milestoneStatusLabel(s)}</option>
              ))}
            </select>
          </>
        )}

        <span className="text-gray-500 font-medium">Target Date</span>
        <input
          type="date"
          value={m.target_date}
          onChange={(e) => { onUpdate(m.id, "target_date", e.target.value); onReload(); }}
          className="rounded border border-gray-200 px-2 py-0.5 text-sm"
        />

        <span className="text-gray-500 font-medium">Owner</span>
        <OwnerPicker
          value={m.owner_id || ""}
          onChange={(id) => onUpdate(m.id, "owner_id", id || null)}
          people={people}
          onPersonAdded={onPersonAdded}
        />

        {(m.milestone_type === "project" || m.milestone_type === "proposed_project") && (
          <>
            <span className="text-gray-500 font-medium">Project</span>
            <select
              value={m.project_id || ""}
              onChange={(e) => onUpdate(m.id, "project_id", e.target.value || null)}
              className="rounded border border-gray-200 px-2 py-0.5 text-sm"
            >
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}
        {(m.milestone_type === "initiative" || m.milestone_type === "proposed_initiative") && (
          <>
            <span className="text-gray-500 font-medium">Initiative</span>
            <select
              value={m.initiative_id || ""}
              onChange={(e) => onUpdate(m.id, "initiative_id", e.target.value || null)}
              className="rounded border border-gray-200 px-2 py-0.5 text-sm"
            >
              <option value="">None</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        {editDesc ? (
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => { onUpdate(m.id, "description", desc.trim() || null); setEditDesc(false); }}
            rows={3}
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
        ) : (
          <div
            className="text-sm text-gray-700 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 min-h-[2rem]"
            onClick={() => setEditDesc(true)}
          >
            {m.description || <span className="text-gray-400 italic">Click to add description...</span>}
          </div>
        )}
      </div>

      {/* Delete */}
      {canDelete(role) && (
        <div className="flex justify-end">
          <button
            onClick={() => onDelete(m.id)}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

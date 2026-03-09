"use client";

import { useState, useEffect, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { priorityColor, priorityDot, formatAge } from "@/lib/utils";
import type { Project, ProjectAgendaRow, PriorityLevel, Person, Vendor } from "@/lib/types";
import { useRole } from "@/components/role-context";
import { canCreate, canDelete } from "@/lib/permissions";
import OwnerPicker from "@/components/owner-picker";
import VendorPicker from "@/components/vendor-picker";

const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];

const priorityLabels: Record<PriorityLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const typeLabels: Record<string, string> = {
  blocker: "Blocker",
  action_item: "Action Item",
  agenda_item: "Agenda",
  raid_risk: "Risk",
  raid_issue: "Issue",
  raid_action: "RAID Action",
  raid_assumption: "Assumption",
  raid_decision: "Decision",
};

const priorityRankMap: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Parent info for subtask grouping in agendas
interface ParentGroupInfo {
  childToParent: Map<string, string>;
  parentTitles: Map<string, string>;
}

type AgendaUnit<T> =
  | { kind: "standalone"; item: T }
  | { kind: "group"; parent: T | null; parentTitle: string; children: T[] };

function buildAgendaUnits<T extends { entity_id: string }>(
  items: T[],
  info: ParentGroupInfo
): AgendaUnit<T>[] {
  if (info.childToParent.size === 0) return items.map((i) => ({ kind: "standalone", item: i }));

  const itemMap = new Map<string, T>();
  for (const item of items) itemMap.set(item.entity_id, item);

  const parentChildIds = new Map<string, string[]>();
  for (const item of items) {
    const pid = info.childToParent.get(item.entity_id);
    if (pid) {
      if (!parentChildIds.has(pid)) parentChildIds.set(pid, []);
      parentChildIds.get(pid)!.push(item.entity_id);
    }
  }

  const groupedPids = new Set<string>();
  for (const [pid, cids] of parentChildIds) {
    if (cids.length >= 2) groupedPids.add(pid);
  }

  const skip = new Set<string>();
  for (const pid of groupedPids) {
    parentChildIds.get(pid)!.forEach((id) => skip.add(id));
    if (itemMap.has(pid)) skip.add(pid);
  }

  const result: AgendaUnit<T>[] = [];
  const emitted = new Set<string>();

  for (const item of items) {
    if (skip.has(item.entity_id)) {
      const pid = info.childToParent.get(item.entity_id);
      const groupPid = pid && groupedPids.has(pid) ? pid
        : groupedPids.has(item.entity_id) ? item.entity_id : null;
      if (groupPid && !emitted.has(groupPid)) {
        emitted.add(groupPid);
        const children = (parentChildIds.get(groupPid) || [])
          .map((id) => itemMap.get(id)!)
          .filter(Boolean);
        result.push({
          kind: "group",
          parent: itemMap.get(groupPid) || null,
          parentTitle: info.parentTitles.get(groupPid) || "Parent Task",
          children,
        });
      }
      continue;
    }
    result.push({ kind: "standalone", item });
  }
  return result;
}

function InlineText({ value, onSave, placeholder, multiline }: { value: string; onSave: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  if (!editing) {
    return (
      <p
        className="text-gray-900 mt-0.5 hover:bg-gray-100 rounded cursor-pointer px-1 -mx-1 py-0.5"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      >
        {value || <span className="text-gray-400">{placeholder || "—"}</span>}
      </p>
    );
  }

  if (multiline) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
        rows={2}
        autoFocus
        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-0.5"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
      autoFocus
      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mt-0.5"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function AgendaView({
  project,
  initialItems,
  people,
  vendors,
  onCountChange,
  onNewItemsSuggested,
  onPersonAdded,
  onVendorAdded,
  onItemResolved,
  onItemRestored,
  addUndo,
  refreshTrigger,
}: {
  project: Project;
  initialItems: ProjectAgendaRow[];
  people: Person[];
  vendors: Vendor[];
  onCountChange?: (count: number) => void;
  onNewItemsSuggested?: (items: { title: string; suggested_type?: string; priority?: string; description?: string }[]) => void;
  onPersonAdded?: (person: Person) => void;
  onVendorAdded?: (vendor: Vendor) => void;
  onItemResolved?: (entityType: string, entityId: string) => void;
  onItemRestored?: (entityType: string, entityId: string) => void;
  addUndo?: (label: string, undo: () => Promise<void>) => void;
  refreshTrigger?: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [groupInfo, setGroupInfo] = useState<ParentGroupInfo>({ childToParent: new Map(), parentTitles: new Map() });

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  // Fetch parent_id info for RAID items to enable subtask grouping
  useEffect(() => {
    const raidIds = items
      .filter((i) => i.entity_type.startsWith("raid_"))
      .map((i) => i.entity_id);
    if (raidIds.length === 0) { setGroupInfo({ childToParent: new Map(), parentTitles: new Map() }); return; }

    let cancelled = false;
    supabase
      .from("raid_entries")
      .select("id, parent_id")
      .in("id", raidIds)
      .then(async ({ data: entries }) => {
        if (cancelled || !entries?.length) { if (!cancelled) setGroupInfo({ childToParent: new Map(), parentTitles: new Map() }); return; }
        const childToParent = new Map<string, string>();
        const pIds = new Set<string>();
        for (const e of entries) {
          if (e.parent_id) {
            childToParent.set(e.id, e.parent_id);
            pIds.add(e.parent_id);
          }
        }
        const titleMap = new Map<string, string>();
        const raidIdSet = new Set(raidIds);
        for (const item of items) {
          if (pIds.has(item.entity_id)) titleMap.set(item.entity_id, item.title);
        }
        const missingPids = Array.from(pIds).filter((pid) => !raidIdSet.has(pid));
        if (missingPids.length > 0) {
          const { data: parents } = await supabase.from("raid_entries").select("id, title").in("id", missingPids);
          if (parents) parents.forEach((p) => titleMap.set(p.id, p.title));
        }
        if (!cancelled) setGroupInfo({ childToParent, parentTitles: titleMap });
      });
    return () => { cancelled = true; };
  }, [items]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newAsk, setNewAsk] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<PriorityLevel>>(new Set());
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { role, profileId } = useRole();

  function toggleGroup(priority: PriorityLevel) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleResolve(item: ProjectAgendaRow) {
    if (resolvingId) return;
    setResolvingId(item.entity_id);
    if (expandedId === item.entity_id) setExpandedId(null);

    const now = new Date().toISOString();
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    const resolvedStatus = item.entity_type.startsWith("raid_") ? "closed" : "complete";

    // Fetch current status before resolving so undo can restore it
    const { data: current } = await supabase.from(table).select("status").eq("id", item.entity_id).single();
    const prevStatus = current?.status || "pending";

    // Start DB update in parallel with animation
    const dbPromise = supabase.from(table).update({ status: resolvedStatus, resolved_at: now }).eq("id", item.entity_id);
    await new Promise((r) => setTimeout(r, 400));
    await dbPromise;

    setResolvingId(null);
    setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
    onItemResolved?.(item.entity_type, item.entity_id);

    addUndo?.(`Resolved "${item.title}"`, async () => {
      await supabase.from(table).update({ status: prevStatus, resolved_at: null }).eq("id", item.entity_id);
      setItems((prev) => [...prev, item]);
      onItemRestored?.(item.entity_type, item.entity_id);
    });

    router.refresh();
  }

  function handleRemoveFromMeeting(item: ProjectAgendaRow) {
    if (item.entity_type === "agenda_item") return;
    const table = item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
    supabase.from(table).update({ include_in_meeting: false }).eq("id", item.entity_id);
  }

  function saveField(item: ProjectAgendaRow, field: string, value: string) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    supabase.from(table).update({ [field]: value || null }).eq("id", item.entity_id);
    setItems((prev) => prev.map((i) => {
      if (i.entity_id !== item.entity_id) return i;
      if (field === "title") return { ...i, title: value };
      if (field === "priority") return { ...i, priority: value as PriorityLevel };
      if (field === "context" || field === "notes" || field === "impact_description") return { ...i, context: value };
      if (field === "ask") return { ...i, ask: value };
      if (field === "owner_id") {
        const person = people.find((p) => p.id === value);
        return { ...i, owner_id: value || null, owner_name: person?.full_name || null };
      }
      if (field === "vendor_id") {
        const vendor = vendors.find((v) => v.id === value);
        return { ...i, vendor_id: value || null, vendor_name: vendor?.name || null };
      }
      return i;
    }));
  }

  async function handleDelete(item: ProjectAgendaRow) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    await supabase.from(table).delete().eq("id", item.entity_id);
    setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
    if (expandedId === item.entity_id) setExpandedId(null);
    router.refresh();
  }

  async function handleAddItem() {
    if (!newTitle.trim()) return;
    await supabase.from("agenda_items").insert({
      project_id: project.id,
      title: newTitle.trim(),
      context: newContext.trim() || null,
      ask: newAsk.trim() || null,
      severity: "new",
      priority: "medium",
      org_id: project.org_id,
      created_by: profileId,
    });
    setNewTitle("");
    setNewContext("");
    setNewAsk("");
    setShowAddForm(false);
    router.refresh();
  }

  async function handleSaveNotes(item: ProjectAgendaRow) {
    if (!notesText.trim()) return;
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    setSavingNotes(true);
    try {
      const res = await fetch("/api/agenda-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: item.entity_type,
          current: {
            title: item.title,
            context: item.context || "",
            ask: item.ask || "",
            priority: item.priority,
          },
          notes: notesText,
        }),
      });

      if (!res.ok) { setSavingNotes(false); return; }
      const { updates: aiUpdates, new_items } = await res.json();

      const merged = {
        title: aiUpdates.title || item.title,
        context: aiUpdates.context !== undefined ? aiUpdates.context : (item.context || ""),
        ask: aiUpdates.ask !== undefined ? aiUpdates.ask : (item.ask || ""),
        priority: aiUpdates.priority || item.priority,
      };

      const dbUpdates: Record<string, unknown> = { title: merged.title, priority: merged.priority };
      if (item.entity_type === "agenda_item") {
        dbUpdates.context = merged.context || null;
        dbUpdates.ask = merged.ask || null;
      } else if (item.entity_type === "action_item") {
        dbUpdates.notes = merged.context || null;
      } else if (item.entity_type === "blocker") {
        dbUpdates.impact_description = merged.context || null;
      }
      if (aiUpdates.status) dbUpdates.status = aiUpdates.status;
      if (aiUpdates.due_date !== undefined) dbUpdates.due_date = aiUpdates.due_date;

      setItems((prev) =>
        prev.map((i) =>
          i.entity_id === item.entity_id
            ? { ...i, title: merged.title, priority: merged.priority as PriorityLevel, context: merged.context || null, ask: merged.ask || null }
            : i
        )
      );
      setNotesText("");
      setSavingNotes(false);

      supabase.from(table).update(dbUpdates).eq("id", item.entity_id);

      if (new_items?.length > 0 && onNewItemsSuggested) {
        onNewItemsSuggested(new_items);
      }
    } catch {
      setSavingNotes(false);
    }
  }

  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(initialItems.length > 0);
  const [mode, setMode] = useState<"auto" | "selected">("selected");

  useEffect(() => {
    let cancelled = false;
    const rpcName = mode === "selected" ? "generate_project_agenda_from_selected" : "generate_project_agenda";
    supabase.rpc(rpcName, { p_project_id: project.id, p_limit: 30 }).then(({ data }) => {
      if (!cancelled && data) {
        setItems(data as ProjectAgendaRow[]);
        setHasGenerated(true);
      }
    });
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    const rpcName = mode === "selected" ? "generate_project_agenda_from_selected" : "generate_project_agenda";
    const { data } = await supabase.rpc(rpcName, { p_project_id: project.id, p_limit: 30 });
    setItems((data || []) as ProjectAgendaRow[]);
    setHasGenerated(true);
    setGenerating(false);
  }

  function switchMode(newMode: "auto" | "selected") {
    if (newMode === mode) return;
    setMode(newMode);
    setGenerating(true);
    const rpcName = newMode === "selected" ? "generate_project_agenda_from_selected" : "generate_project_agenda";
    supabase.rpc(rpcName, { p_project_id: project.id, p_limit: 30 }).then(({ data }) => {
      setItems((data || []) as ProjectAgendaRow[]);
      setHasGenerated(true);
      setGenerating(false);
    });
  }

  // Build agenda units
  const agendaUnits = buildAgendaUnits(items, groupInfo);

  function unitPriority(unit: AgendaUnit<ProjectAgendaRow>): PriorityLevel {
    if (unit.kind === "standalone") return unit.item.priority;
    const all = unit.parent ? [unit.parent, ...unit.children] : unit.children;
    let best = 3;
    for (const item of all) best = Math.min(best, priorityRankMap[item.priority] ?? 2);
    return (["critical", "high", "medium", "low"] as PriorityLevel[])[best];
  }

  function groupUnitsByPriority() {
    const g: Record<PriorityLevel, AgendaUnit<ProjectAgendaRow>[]> = { critical: [], high: [], medium: [], low: [] };
    agendaUnits.forEach((u) => g[unitPriority(u)]?.push(u));
    return g;
  }

  const unitGroups = groupUnitsByPriority();

  function renderRow(item: ProjectAgendaRow, isChild: boolean, childCount?: number) {
    const isExpanded = expandedId === item.entity_id;
    const isResolving = resolvingId === item.entity_id;
    const hasChildren = childCount !== undefined && childCount > 0;

    return (
      <Fragment key={item.entity_id}>
        {/* Row */}
        <div
          className={`border-b last:border-b-0 cursor-pointer relative ${isResolving ? "bg-green-100 opacity-0 border-transparent" : "bg-white hover:bg-gray-50 border-gray-400"}`}
          style={{
            transition: isResolving ? "all 350ms ease-out" : undefined,
            paddingLeft: isChild ? "2rem" : "0.75rem",
            paddingRight: "0.75rem",
            ...(isResolving ? { maxHeight: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" } : { maxHeight: 200, paddingTop: "0.5rem", paddingBottom: "0.5rem" }),
          }}
          onClick={() => toggleExpand(item.entity_id)}
        >
          <div className="flex items-center gap-4 min-w-0">
            {isChild && (
              <span className="text-gray-300 flex-shrink-0 -ml-2 mr--2">↳</span>
            )}
            {/* Subtask disclosure triangle */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedParents((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.entity_id)) next.delete(item.entity_id);
                    else next.add(item.entity_id);
                    return next;
                  });
                }}
                className="flex items-center gap-1 text-[10px] text-[#000000] hover:text-[#000000] flex-shrink-0 transition-colors w-[20px] justify-center"
                title={expandedParents.has(item.entity_id) ? "Hide subtasks" : "Show subtasks"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform ${expandedParents.has(item.entity_id) ? "rotate-90" : ""}`}>
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              </button>
            ) : (
              <span className="w-[20px] flex-shrink-0" />
            )}
            {/* Complete circle */}
            <button
              onClick={(e) => { e.stopPropagation(); handleResolve(item); }}
              className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group/check"
              title="Resolve"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-transparent group-hover/check:text-green-500 transition-colors">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            {/* Bell toggle */}
            {item.entity_type !== "agenda_item" ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveFromMeeting(item); }}
                className="p-0.5 rounded transition-colors flex-shrink-0 text-blue-600 hover:text-gray-400"
                title="Remove from meeting"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
            ) : (
              <span className="w-[22px] flex-shrink-0" />
            )}
            {/* Title */}
            <span className={`text-sm font-semibold truncate min-w-0 ${isChild ? "text-gray-700" : "text-gray-900"}`}>{item.title}</span>
            {hasChildren && (
              <span className="text-[10px] text-[#000000] bg-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{childCount}</span>
            )}
            {/* Spacer */}
            <div className="flex-1" />
            {/* Priority */}
            <div className="w-[68px] flex-shrink-0">
              <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${priorityColor(item.priority)}`}>{priorityLabels[item.priority]}</span>
            </div>
            {/* Type */}
            <span className="text-xs text-gray-500 w-[80px] flex-shrink-0">{typeLabels[item.entity_type] || item.entity_type}</span>
            {/* Owner */}
            <div className="flex items-center gap-1.5 w-[140px] flex-shrink-0 min-w-0">
              {item.owner_name ? (
                <>
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">{item.owner_name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                  <span className="text-xs text-gray-700 truncate">{item.owner_name}</span>
                </>
              ) : (<span className="text-xs text-gray-400 italic">Unassigned</span>)}
            </div>
            {/* Age */}
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">{formatAge(item.age_days)}</span>
            {/* Score */}
            <span className="text-xs text-gray-400 w-10 flex-shrink-0 text-right">{Math.round(item.score)}</span>
          </div>
        </div>

        {/* Expanded detail panel */}
        {isExpanded && (
          <div className="bg-white border-b border-gray-200" onClick={(e) => e.stopPropagation()}>
            {/* Editable title */}
            <div className="px-5 pt-3 pb-1">
              <InlineText
                value={item.title}
                onSave={(v) => saveField(item, "title", v)}
                placeholder="Untitled"
              />
            </div>
            {/* Properties grid */}
            <div className="border-t border-gray-200">
              <div className="grid grid-cols-[120px_1fr_120px_1fr] items-stretch">
                {/* Row: Type / Priority */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Type</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <span className="text-sm text-gray-700">{typeLabels[item.entity_type] || item.entity_type}</span>
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Priority</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <select
                    value={item.priority}
                    onChange={(e) => saveField(item, "priority", e.target.value)}
                    className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                  >
                    {priorityOptions.map((p) => (
                      <option key={p} value={p}>{priorityLabels[p]}</option>
                    ))}
                  </select>
                </div>

                {/* Row: Owner / Vendor */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Owner</span>
                <div className="px-3 py-1.5 border-b border-gray-200">
                  <OwnerPicker
                    value={item.owner_id || ""}
                    onChange={(id) => saveField(item, "owner_id", id)}
                    people={people}
                    onPersonAdded={onPersonAdded || (() => {})}
                  />
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Vendor</span>
                <div className="px-3 py-1.5 border-b border-gray-200">
                  <VendorPicker
                    value={item.vendor_id || ""}
                    onChange={(id) => saveField(item, "vendor_id", id)}
                    vendors={vendors}
                    onVendorAdded={onVendorAdded || (() => {})}
                  />
                </div>

                {/* Row: Age / Score */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Age</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <span className="text-sm text-gray-700">{formatAge(item.age_days)}</span>
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Score</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <span className="text-sm text-gray-700">{Math.round(item.score)}</span>
                </div>

                {/* Row: Escalations / Rank */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Escalations</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <span className="text-sm text-gray-700">{item.escalation_count > 0 ? `${item.escalation_count}x` : "None"}</span>
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Rank</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <span className="text-sm text-gray-700">#{item.rank}</span>
                </div>
              </div>
            </div>

            {/* Context */}
            <div className="px-5 py-3">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Context</span>
              <InlineText
                value={item.context || ""}
                onSave={(v) => {
                  const field = item.entity_type === "action_item" ? "notes" : item.entity_type === "blocker" ? "impact_description" : "context";
                  saveField(item, field, v);
                }}
                multiline
                placeholder="Add context..."
              />
            </div>

            {/* Ask (agenda items only) */}
            {(item.entity_type === "agenda_item" || item.ask) && (
              <div className="px-5 py-3 border-t border-gray-200">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Ask</span>
                <InlineText
                  value={item.ask || ""}
                  onSave={(v) => saveField(item, "ask", v)}
                  multiline
                  placeholder="What do we need?"
                />
              </div>
            )}

            {/* Call Notes */}
            <div className="px-5 py-3 border-t border-gray-200">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Call Notes</span>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Take notes during the call..."
                rows={3}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
              />
              {notesText.trim() && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSaveNotes(item)}
                    disabled={savingNotes}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {savingNotes && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                    {savingNotes ? "Processing..." : "Process Notes"}
                  </button>
                </div>
              )}
            </div>

            {/* Actions bar */}
            <div className="flex justify-end items-center gap-3 px-5 py-2 border-t border-gray-200">
              {canDelete(role) && (
                <button
                  onClick={() => handleDelete(item)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </Fragment>
    );
  }

  function renderUnit(unit: AgendaUnit<ProjectAgendaRow>) {
    if (unit.kind === "standalone") {
      return renderRow(unit.item, false);
    }
    // Group: parent row with disclosure + indented children
    const parentId = unit.parent?.entity_id || unit.parentTitle;
    const isParentExpanded = expandedParents.has(parentId);
    return (
      <div key={`group-${parentId}`}>
        {unit.parent ? (
          renderRow(unit.parent, false, unit.children.length)
        ) : (
          // Synthetic parent header (parent not in agenda)
          <div className="border-b border-gray-400 px-3 py-2">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => {
                  setExpandedParents((prev) => {
                    const next = new Set(prev);
                    if (next.has(parentId)) next.delete(parentId);
                    else next.add(parentId);
                    return next;
                  });
                }}
                className="flex items-center gap-1 text-[10px] text-[#000000] flex-shrink-0 transition-colors w-[20px] justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform ${isParentExpanded ? "rotate-90" : ""}`}>
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              </button>
              <span className="w-[18px] flex-shrink-0" />
              <span className="w-[22px] flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900">{unit.parentTitle}</span>
              <span className="text-[10px] text-[#000000] bg-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{unit.children.length}</span>
            </div>
          </div>
        )}
        {(unit.parent ? expandedParents.has(unit.parent.entity_id) : isParentExpanded) && (
          <div>
            {unit.children.map((child) => renderRow(child, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Meeting Agenda</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {items.length} items{mode === "selected" ? " from selected" : ""}, ranked by priority + age + escalations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
            <button
              onClick={() => switchMode("auto")}
              className={`px-3 py-1.5 transition-colors ${mode === "auto" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Auto
            </button>
            <button
              onClick={() => switchMode("selected")}
              className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${mode === "selected" ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              From Selected
            </button>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => { setItems([]); setHasGenerated(false); }}
              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-gray-300 rounded-md hover:bg-red-50"
            >
              Reset
            </button>
          )}
          {canCreate(role) && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Add Item
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            )}
            {generating ? "Generating..." : hasGenerated ? "Update Agenda" : "Generate Agenda"}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <input
            type="text"
            placeholder="Topic title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            placeholder="Context (optional)"
            value={newContext}
            onChange={(e) => setNewContext(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <textarea
            placeholder="Ask / What we need (optional)"
            value={newAsk}
            onChange={(e) => setNewAsk(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button onClick={handleAddItem} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Add</button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No agenda items. Add items or check project action items and blockers.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          {/* Column headers */}
          <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
            <div className="flex items-center gap-4">
              <span className="w-[20px] flex-shrink-0" />
              <span className="w-[18px] flex-shrink-0" />
              <span className="w-[22px] flex-shrink-0" />
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide flex-1">Name</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[68px]">Priority</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[80px]">Type</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[140px]">Owner</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-12">Age</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-10 text-right">Score</span>
            </div>
          </div>

          {/* Rows grouped by priority */}
          {priorityOptions.map((priority) => {
            const units = unitGroups[priority];
            if (units.length === 0) return null;
            const isCollapsed = collapsedGroups.has(priority);
            const itemCount = units.reduce((n, u) => n + (u.kind === "group" ? u.children.length + (u.parent ? 1 : 0) : 1), 0);

            return (
              <div key={priority}>
                <button
                  onClick={() => toggleGroup(priority)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-800 border-b border-gray-900 hover:bg-gray-700 transition-colors text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className={`w-2 h-2 rounded-full ${priorityDot(priority)}`} />
                  <span className="text-xs font-semibold text-white uppercase tracking-wide">{priorityLabels[priority]}</span>
                  <span className="text-xs text-gray-400">{itemCount}</span>
                </button>
                {!isCollapsed && units.map((unit) => renderUnit(unit))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

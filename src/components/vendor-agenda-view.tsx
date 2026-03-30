"use client";

import { useState, useEffect, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { priorityColor, priorityDot, formatAge, statusBadge, formatDateShort } from "@/lib/utils";
import type { Vendor, VendorAgendaRow, PriorityLevel, ItemStatus, Person } from "@/lib/types";
import { useRole } from "@/components/role-context";
import { canCreate, canDelete } from "@/lib/permissions";
import OwnerPicker from "@/components/owner-picker";

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
  if (info.childToParent.size === 0) return items.map((i) => ({ kind: "standalone" as const, item: i }));
  const itemMap = new Map<string, T>();
  for (const item of items) itemMap.set(item.entity_id, item);
  const parentChildIds = new Map<string, string[]>();
  for (const item of items) {
    const pid = info.childToParent.get(item.entity_id);
    if (pid) { if (!parentChildIds.has(pid)) parentChildIds.set(pid, []); parentChildIds.get(pid)!.push(item.entity_id); }
  }
  const groupedPids = new Set<string>();
  for (const [pid, cids] of parentChildIds) { if (cids.length >= 2) groupedPids.add(pid); }
  const skip = new Set<string>();
  for (const pid of groupedPids) { parentChildIds.get(pid)!.forEach((id) => skip.add(id)); if (itemMap.has(pid)) skip.add(pid); }
  const result: AgendaUnit<T>[] = [];
  const emitted = new Set<string>();
  for (const item of items) {
    if (skip.has(item.entity_id)) {
      const pid = info.childToParent.get(item.entity_id);
      const groupPid = pid && groupedPids.has(pid) ? pid : groupedPids.has(item.entity_id) ? item.entity_id : null;
      if (groupPid && !emitted.has(groupPid)) {
        emitted.add(groupPid);
        const children = (parentChildIds.get(groupPid) || []).map((id) => itemMap.get(id)!).filter(Boolean);
        result.push({ kind: "group", parent: itemMap.get(groupPid) || null, parentTitle: info.parentTitles.get(groupPid) || "Parent Task", children });
      }
      continue;
    }
    result.push({ kind: "standalone", item });
  }
  return result;
}

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
  agenda_item: "Discussion",
  raid_risk: "Risk",
  raid_issue: "Issue",
  raid_action: "RAID Action",
  raid_assumption: "Assumption",
  raid_decision: "Decision",
};

const priorityRankMap: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const statusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];
const riskStatusOptions: ItemStatus[] = ["identified", "assessing", "mitigated", "closed"];

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
    if (multiline && value) {
      const html = value
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
      return (
        <div
          className="text-gray-900 text-sm mt-0.5 hover:bg-gray-100 rounded cursor-pointer px-1 -mx-1 py-0.5"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
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
        ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); }}
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

export function VendorAgendaView({
  vendor,
  people,
  onPersonAdded,
}: {
  vendor: Vendor;
  people: Person[];
  onPersonAdded?: (person: Person) => void;
}) {
  const [items, setItems] = useState<VendorAgendaRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [groupInfo, setGroupInfo] = useState<ParentGroupInfo>({ childToParent: new Map(), parentTitles: new Map() });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<PriorityLevel>("medium");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newAsk, setNewAsk] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<PriorityLevel>>(new Set());
  const [notesText, setNotesText] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { role, profileId } = useRole();

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("generate_vendor_agenda", { p_vendor_id: vendor.id, p_limit: 30 }).then(({ data }) => {
      if (!cancelled && data) {
        setItems(data as VendorAgendaRow[]);
        setHasGenerated(true);
      }
    });
    supabase.from("projects").select("id, name, slug").order("name").then(({ data }) => {
      if (!cancelled && data) setProjects(data);
    });
    supabase.from("vendors").select("id, name").order("name").then(({ data }) => {
      if (!cancelled && data) setVendors(data as { id: string; name: string }[]);
    });
    return () => { cancelled = true; };
  }, [vendor.id]);

  // Fetch parent_id info for RAID items to enable subtask grouping
  useEffect(() => {
    const raidIds = items.filter((i) => i.entity_type.startsWith("raid_")).map((i) => i.entity_id);
    if (raidIds.length === 0) { setGroupInfo({ childToParent: new Map(), parentTitles: new Map() }); return; }
    let cancelled = false;
    supabase.from("raid_entries").select("id, parent_id").in("id", raidIds)
      .then(async ({ data: entries }) => {
        if (cancelled || !entries?.length) { if (!cancelled) setGroupInfo({ childToParent: new Map(), parentTitles: new Map() }); return; }
        const childToParent = new Map<string, string>();
        const pIds = new Set<string>();
        for (const e of entries) { if (e.parent_id) { childToParent.set(e.id, e.parent_id); pIds.add(e.parent_id); } }
        const titleMap = new Map<string, string>();
        const raidIdSet = new Set(raidIds);
        for (const item of items) { if (pIds.has(item.entity_id)) titleMap.set(item.entity_id, item.title); }
        const missingPids = Array.from(pIds).filter((pid) => !raidIdSet.has(pid));
        if (missingPids.length > 0) {
          const { data: parents } = await supabase.from("raid_entries").select("id, title").in("id", missingPids);
          if (parents) parents.forEach((p) => titleMap.set(p.id, p.title));
        }
        if (!cancelled) setGroupInfo({ childToParent, parentTitles: titleMap });
      });
    return () => { cancelled = true; };
  }, [items]);

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

  async function handleResolve(item: VendorAgendaRow) {
    if (resolvingId) return;
    setResolvingId(item.entity_id);
    if (expandedId === item.entity_id) setExpandedId(null);

    const now = new Date().toISOString();
    const doUpdate = () => {
      if (item.entity_type === "agenda_item") {
        return supabase.from("agenda_items").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
      } else if (item.entity_type === "blocker") {
        return supabase.from("blockers").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
      } else if (item.entity_type === "action_item") {
        return supabase.from("action_items").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
      } else {
        return supabase.from("raid_entries").update({ status: "closed", resolved_at: now }).eq("id", item.entity_id);
      }
    };

    const dbPromise = doUpdate();
    await new Promise((r) => setTimeout(r, 400));
    await dbPromise;

    setResolvingId(null);
    setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
    router.refresh();
  }

  function handleRemoveFromMeeting(item: VendorAgendaRow) {
    if (item.entity_type === "agenda_item") return;
    const table = item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
    supabase.from(table).update({ include_in_meeting: false }).eq("id", item.entity_id).then(() => {});
  }

  function saveField(item: VendorAgendaRow, field: string, value: string) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    const fkFields = ["owner_id", "vendor_id", "due_date"];
    const dbUpdates: Record<string, unknown> = { [field]: fkFields.includes(field) ? (value || null) : value };
    if (field === "status") {
      const resolvedStatuses = ["complete", "closed", "mitigated"];
      if (!resolvedStatuses.includes(value)) {
        dbUpdates.resolved_at = null;
      }
    }
    supabase.from(table).update(dbUpdates).eq("id", item.entity_id).then(() => {});
    setItems((prev) => prev.map((i) => {
      if (i.entity_id !== item.entity_id) return i;
      if (field === "title") return { ...i, title: value };
      if (field === "priority") return { ...i, priority: value as PriorityLevel };
      if (field === "status") return { ...i, status: value as ItemStatus };
      if (field === "due_date") return { ...i, due_date: value || null };
      if (field === "context" || field === "description" || field === "notes" || field === "impact_description") return { ...i, context: value };
      if (field === "ask" || field === "next_steps") return { ...i, ask: value };
      if (field === "owner_id") {
        const person = people.find((p) => p.id === value);
        return { ...i, owner_id: value || null, owner_name: person?.full_name || null };
      }
      return i;
    }));
  }

  async function handleDelete(item: VendorAgendaRow) {
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
      vendor_id: vendor.id,
      project_id: newProjectId || null,
      title: newTitle.trim(),
      context: newContext.trim() || null,
      ask: newAsk.trim() || null,
      severity: "new",
      priority: newPriority,
      org_id: vendor.org_id,
      created_by: profileId,
    });
    setNewTitle("");
    setNewPriority("medium");
    setNewOwnerId("");
    setNewProjectId("");
    setNewContext("");
    setNewAsk("");
    setShowAddForm(false);
    const { data } = await supabase.rpc("generate_vendor_agenda", { p_vendor_id: vendor.id, p_limit: 30 });
    if (data) setItems(data as VendorAgendaRow[]);
    router.refresh();
  }

  async function handleSaveNotes(item: VendorAgendaRow) {
    if (!notesText?.trim()) return;
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers"
      : item.entity_type === "action_item" ? "action_items"
      : "raid_entries";
    setSavingNotes(true);

    const ownerPerson = item.owner_id ? people.find((p) => p.id === item.owner_id) : null;

    const current: Record<string, string> = {
      title: item.title,
      priority: item.priority,
      status: item.status,
      owner_name: ownerPerson?.full_name || item.owner_name || "(none)",
      vendor_name: vendor.name,
    };
    if (item.entity_type === "agenda_item") {
      current.context = item.context || "";
      current.ask = item.ask || "";
    } else {
      current.due_date = item.due_date || "";
    }

    try {
      const res = await fetch("/api/agenda-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: item.entity_type, current, notes: notesText }),
      });

      if (!res.ok) { setSavingNotes(false); return; }
      const { updates: aiUpdates } = await res.json();

      const dbUpdates: Record<string, unknown> = {};
      const localUpdates: Partial<VendorAgendaRow> = {};

      if (aiUpdates.title) { dbUpdates.title = aiUpdates.title; localUpdates.title = aiUpdates.title; }
      if (aiUpdates.priority) { dbUpdates.priority = aiUpdates.priority; localUpdates.priority = aiUpdates.priority as PriorityLevel; }
      if (aiUpdates.status) { dbUpdates.status = aiUpdates.status; localUpdates.status = aiUpdates.status; }
      if (aiUpdates.due_date !== undefined) dbUpdates.due_date = aiUpdates.due_date;

      if (item.entity_type === "agenda_item") {
        if (aiUpdates.context) { dbUpdates.context = aiUpdates.context; localUpdates.context = aiUpdates.context; }
        if (aiUpdates.ask) { dbUpdates.ask = aiUpdates.ask; localUpdates.ask = aiUpdates.ask; }
      } else if (item.entity_type === "action_item") {
        if (aiUpdates.description) dbUpdates.description = aiUpdates.description;
        if (aiUpdates.notes) dbUpdates.notes = aiUpdates.notes;
        if (aiUpdates.next_steps) dbUpdates.next_steps = aiUpdates.next_steps;
      } else if (item.entity_type === "blocker") {
        if (aiUpdates.description) dbUpdates.description = aiUpdates.description;
        if (aiUpdates.impact_description) dbUpdates.impact_description = aiUpdates.impact_description;
      } else {
        if (aiUpdates.description) dbUpdates.description = aiUpdates.description;
        if (aiUpdates.notes) dbUpdates.notes = aiUpdates.notes;
        if (aiUpdates.next_steps) dbUpdates.next_steps = aiUpdates.next_steps;
      }

      // Resolve owner_name to owner_id
      if (aiUpdates.owner_name) {
        const nameL = aiUpdates.owner_name.toLowerCase();
        const match = people.find((p) => p.full_name.toLowerCase().includes(nameL) || nameL.includes(p.full_name.toLowerCase()));
        if (match) {
          dbUpdates.owner_id = match.id;
          localUpdates.owner_id = match.id;
          localUpdates.owner_name = match.full_name;
        }
      }

      setItems((prev) => prev.map((i) => i.entity_id === item.entity_id ? { ...i, ...localUpdates } : i));
      setNotesText(null);
      setSavingNotes(false);

      supabase.from(table).update(dbUpdates).eq("id", item.entity_id).then(() => {});
    } catch {
      setSavingNotes(false);
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    const { data } = await supabase.rpc("generate_vendor_agenda", { p_vendor_id: vendor.id, p_limit: 30 });
    setItems((data || []) as VendorAgendaRow[]);
    setHasGenerated(true);
    setGenerating(false);
  }

  // Build agenda units
  const agendaUnits = buildAgendaUnits(items, groupInfo);

  function unitPriority(unit: AgendaUnit<VendorAgendaRow>): PriorityLevel {
    if (unit.kind === "standalone") return unit.item.priority;
    const all = unit.parent ? [unit.parent, ...unit.children] : unit.children;
    let best = 3;
    for (const item of all) best = Math.min(best, priorityRankMap[item.priority] ?? 2);
    return (["critical", "high", "medium", "low"] as PriorityLevel[])[best];
  }

  function groupUnitsByPriority() {
    const g: Record<PriorityLevel, AgendaUnit<VendorAgendaRow>[]> = { critical: [], high: [], medium: [], low: [] };
    agendaUnits.forEach((u) => g[unitPriority(u)]?.push(u));
    return g;
  }

  const unitGroups = groupUnitsByPriority();

  function renderRow(item: VendorAgendaRow, isChild: boolean, childCount?: number) {
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
            {/* Project */}
            <span className="text-xs w-[100px] flex-shrink-0 truncate">
              {item.project_slug ? (
                <Link href={`/projects/${item.project_slug}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {item.project_name}
                </Link>
              ) : (
                <span className="text-gray-500">{item.project_name || "—"}</span>
              )}
            </span>
            {/* Age */}
            <span className="text-xs text-gray-500 w-12 flex-shrink-0">{formatAge(item.age_days)}</span>
            {/* Score */}
            <span className="text-xs text-gray-400 w-10 flex-shrink-0 text-right">{Math.round(item.score)}</span>
          </div>
        </div>

        {/* Expanded detail panel */}
        {isExpanded && (
          <div className="bg-yellow-50/25 border-b border-gray-200" onClick={(e) => e.stopPropagation()}>
            {/* Editable title */}
            <div className="px-5 pt-4 pb-3 text-base font-semibold text-gray-900 bg-yellow-50/25">
              <InlineText
                value={item.title}
                onSave={(v) => saveField(item, "title", v)}
                placeholder="Untitled"
              />
            </div>
            <div className="border-t border-gray-200 bg-white">
              <div className="grid grid-cols-[120px_1fr_120px_1fr] items-stretch">
                {/* Row: Type / Priority */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Type</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  {item.entity_type.startsWith("raid_") ? (
                    <select
                      value={item.entity_type.replace("raid_", "")}
                      onChange={(e) => {
                        const newRaidType = e.target.value;
                        const newEntityType = `raid_${newRaidType}`;
                        supabase.from("raid_entries").update({ raid_type: newRaidType }).eq("id", item.entity_id).then(() => {});
                        setItems((prev) => prev.map((i) => i.entity_id === item.entity_id ? { ...i, entity_type: newEntityType } : i));
                      }}
                      className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                    >
                      <option value="risk">Risk</option>
                      <option value="issue">Issue</option>
                      <option value="assumption">Assumption</option>
                      <option value="decision">Decision</option>
                    </select>
                  ) : (
                    <span className="text-sm text-gray-700">{typeLabels[item.entity_type] || item.entity_type}</span>
                  )}
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

                {/* Row: Owner / Project */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Owner</span>
                <div className="px-3 py-1.5 border-b border-gray-200">
                  <OwnerPicker
                    value={item.owner_id || ""}
                    onChange={(id) => saveField(item, "owner_id", id)}
                    people={people}
                    onPersonAdded={onPersonAdded || (() => {})}
                  />
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Project</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <select
                    value={(() => {
                      const match = projects.find((p) => p.slug === item.project_slug);
                      return match?.id || "";
                    })()}
                    onChange={(e) => {
                      const proj = projects.find((p) => p.id === e.target.value);
                      saveField(item, "project_id", e.target.value);
                      setItems((prev) => prev.map((i) => i.entity_id === item.entity_id ? { ...i, project_name: proj?.name || null, project_slug: proj?.slug || null } : i));
                    }}
                    className="text-sm text-gray-700 border border-gray-200 rounded px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>

                {/* Row: Vendor */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Vendor</span>
                <div className="px-3 py-2.5 border-b border-gray-200 col-span-3">
                  <select
                    value={item.vendor_id || vendor.id}
                    onChange={(e) => {
                      saveField(item, "vendor_id", e.target.value);
                      // Remove from this vendor's agenda if reassigned
                      if (e.target.value !== vendor.id) {
                        setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
                        setExpandedId(null);
                      }
                    }}
                    className="text-sm text-gray-700 border border-gray-200 rounded px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    {vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
                  </select>
                </div>

                {/* Row: Status / Due Date */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Status</span>
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <select
                    value={item.status}
                    onChange={(e) => saveField(item, "status", e.target.value)}
                    className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                  >
                    {(item.entity_type === "raid_risk" ? riskStatusOptions : statusOptions).map((s) => {
                      const badge = statusBadge(s);
                      return <option key={s} value={s}>{badge.label}</option>;
                    })}
                  </select>
                </div>
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Due Date</span>
                <div className="px-3 py-2 border-b border-gray-200">
                  <input
                    type="date"
                    value={item.due_date || ""}
                    onChange={(e) => saveField(item, item.entity_type.startsWith("raid_") ? "decision_date" : "due_date", e.target.value)}
                    className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                  />
                </div>

                {/* Row: Age */}
                <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Age</span>
                <div className="px-3 py-2.5 border-b border-gray-200 col-span-3">
                  <span className="text-sm text-gray-700">{formatAge(item.age_days)}</span>
                </div>
              </div>
            </div>

            {/* Description & Meeting Notes — side by side */}
            <div className="grid grid-cols-2 gap-4 px-5 py-3 border-t border-gray-200 bg-yellow-50/25">
              <div className="rounded border border-gray-200 bg-white p-3">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
                <InlineText
                  value={item.context || ""}
                  onSave={(v) => {
                    const field = item.entity_type === "action_item" ? "description" : item.entity_type === "blocker" ? "description" : item.entity_type === "agenda_item" ? "context" : "description";
                    saveField(item, field, v);
                  }}
                  multiline
                  placeholder="Add description..."
                />
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Meeting Notes</span>
              <textarea
                defaultValue={notesText ?? ""}
                onBlur={(e) => {
                  const v = e.target.value;
                  const table = item.entity_type === "agenda_item" ? "agenda_items"
                    : item.entity_type === "blocker" ? "blockers"
                    : item.entity_type === "action_item" ? "action_items"
                    : "raid_entries";
                  const field = item.entity_type === "action_item" ? "notes" : item.entity_type === "blocker" ? "impact_description" : "notes";
                  supabase.from(table).update({ [field]: v || null }).eq("id", item.entity_id).then(() => {});
                }}
                placeholder="Add meeting notes..."
                rows={6}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
              />
              </div>
            </div>

            {/* Next Steps */}
            <div className="px-5 pb-3">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Next Steps</span>
              <textarea
                defaultValue={item.ask || ""}
                onBlur={(e) => {
                  const field = item.entity_type === "agenda_item" ? "ask" : "next_steps";
                  saveField(item, field, e.target.value);
                }}
                placeholder="Next steps..."
                rows={2}
                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none mt-1"
              />
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

  function renderUnit(unit: AgendaUnit<VendorAgendaRow>) {
    if (unit.kind === "standalone") return renderRow(unit.item, false);
    const parentId = unit.parent?.entity_id || unit.parentTitle;
    const isParentExpanded = expandedParents.has(parentId);
    return (
      <div key={`group-${parentId}`}>
        {unit.parent ? (
          renderRow(unit.parent, false, unit.children.length)
        ) : (
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
            {items.length} items from all linked projects, ranked by priority + age
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <input type="text" placeholder="Topic title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as PriorityLevel)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Owner</label>
              <select value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">Unassigned</option>
                {people.map((p) => (<option key={p.id} value={p.id}>{p.full_name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Project</label>
              <select value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">None</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
          </div>
          <textarea placeholder="Context (optional)" value={newContext} onChange={(e) => setNewContext(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <textarea placeholder="Ask / What we need (optional)" value={newAsk} onChange={(e) => setNewAsk(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button onClick={handleAddItem} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Add</button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No agenda items. Items from linked projects will appear here automatically.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          {/* Column headers */}
          <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
            <div className="flex items-center gap-4">
              <span className="w-[20px] flex-shrink-0" />
              <span className="w-[18px] flex-shrink-0" />
              <span className="w-[22px] flex-shrink-0" />
              {[
                { key: "name", label: "Name", cls: "flex-1" },
                { key: "priority", label: "Priority", cls: "w-[68px]" },
                { key: "type", label: "Type", cls: "w-[80px]" },
                { key: "owner", label: "Owner", cls: "w-[140px]" },
                { key: "project", label: "Project", cls: "w-[100px]" },
                { key: "age", label: "Age", cls: "w-12" },
                { key: "score", label: "Score", cls: "w-10 text-right" },
              ].map((col) => (
                <button
                  key={col.key}
                  onClick={() => { if (sortCol === col.key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); } else { setSortCol(col.key); setSortDir("asc"); } }}
                  className={`text-[10px] font-medium uppercase tracking-wide text-left flex items-center gap-0.5 transition-colors ${col.cls} ${sortCol === col.key ? "text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      {sortDir === "asc" ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Rows — sorted flat or grouped by priority */}
          {sortCol ? (() => {
            const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            const sorted = [...items].sort((a, b) => {
              let cmp = 0;
              switch (sortCol) {
                case "name": cmp = a.title.localeCompare(b.title); break;
                case "priority": cmp = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9); break;
                case "type": cmp = a.entity_type.localeCompare(b.entity_type); break;
                case "owner": cmp = (a.owner_name || "zzz").localeCompare(b.owner_name || "zzz"); break;
                case "project": cmp = (a.project_name || "zzz").localeCompare(b.project_name || "zzz"); break;
                case "age": cmp = a.age_days - b.age_days; break;
                case "score": cmp = a.score - b.score; break;
              }
              return sortDir === "desc" ? -cmp : cmp;
            });
            return sorted.map((item) => <Fragment key={item.entity_id}>{renderRow(item, false)}</Fragment>);
          })() : priorityOptions.map((priority) => {
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

"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { RaidEntry, RaidType, PriorityLevel, ItemStatus, Person, Vendor, Project } from "@/lib/types";
import OwnerPicker from "@/components/owner-picker";
import CommentThread from "@/components/comment-thread";
import VendorPicker from "@/components/vendor-picker";
import { useRole } from "@/components/role-context";
import { canCreate, canDelete, canEditItem } from "@/lib/permissions";

type RaidRow = RaidEntry & { owner: Person | null; reporter: Person | null; vendor: Vendor | null };

interface RaidLogProps {
  initialEntries: RaidRow[];
  project: Project;
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  onVendorAdded: (vendor: Vendor) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
  intakeSourceMap?: Record<string, string>;
  onMeetingToggle?: () => void;
  onConvertedToAction?: (actionId: string) => void;
  onConvertedToBlocker?: (blockerId: string) => void;
  registerUpdater?: (fn: (id: string, field: string, value: string, person?: Person | null, vendor?: Vendor | null) => void) => () => void;
  searchFilter?: string;
}

const raidTypes: RaidType[] = ["risk", "assumption", "issue", "decision"];
const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const statusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];
const riskStatusOptions: ItemStatus[] = ["identified", "assessing", "in_progress", "mitigated", "closed"];
const decisionStatusOptions: ItemStatus[] = ["pending", "complete"];

const typePrefix: Record<RaidType, string> = { risk: "R", assumption: "A", issue: "I", decision: "D" };

type RaidColumnKey = "priority" | "status" | "owner" | "reporter" | "vendor" | "stage" | "age" | "first_flagged";

const RAID_COLUMNS: { key: RaidColumnKey; label: string; width: string }[] = [
  { key: "priority", label: "Priority", width: "w-[68px]" },
  { key: "status", label: "Status", width: "w-[88px]" },
  { key: "owner", label: "Owner", width: "w-[150px]" },
  { key: "reporter", label: "Reporter", width: "w-[150px]" },
  { key: "vendor", label: "Vendor", width: "w-[100px]" },
  { key: "stage", label: "Stage", width: "w-[88px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "first_flagged", label: "Opened", width: "w-[80px]" },
];

const DEFAULT_RAID_COLS: RaidColumnKey[] = ["priority", "status", "owner", "age"];
const RAID_COL_STORAGE_KEY = "raid-columns";

function loadRaidColumns(): RaidColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_RAID_COLS;
  try {
    const stored = localStorage.getItem(RAID_COL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as RaidColumnKey[];
      if (parsed.length > 0 && parsed.every((k) => RAID_COLUMNS.some((c) => c.key === k))) return parsed;
    }
  } catch {}
  return DEFAULT_RAID_COLS;
}

function ageFromDate(date: string): number {
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
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
    if (multiline && value) {
      // Render with line breaks and basic markdown (bold)
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

function InlineDate({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <p
        className="text-gray-900 mt-0.5 hover:bg-gray-100 rounded cursor-pointer px-1 -mx-1 py-0.5"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      >
        {value ? formatDateShort(value) : <span className="text-gray-400">—</span>}
      </p>
    );
  }

  return (
    <input
      type="date"
      value={value || ""}
      onChange={(e) => { onSave(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
      autoFocus
      className="w-48 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mt-0.5"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function RaidLog({ initialEntries, project, people, vendors, onPersonAdded, onVendorAdded, addUndo, onCountChange, intakeSourceMap = {}, onMeetingToggle, onConvertedToAction, onConvertedToBlocker, registerUpdater, searchFilter = "" }: RaidLogProps) {
  const { role, profileId, userPersonId } = useRole();
  const [entries, setEntries] = useState<RaidRow[]>(initialEntries);

  const activeEntries = entries.filter((e) => !e.resolved_at);
  const archivedEntries = entries.filter((e) => e.resolved_at).sort((a, b) => new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime());

  useEffect(() => { onCountChange?.(activeEntries.length); }, [activeEntries.length, onCountChange]);

  useEffect(() => {
    if (!registerUpdater) return;
    return registerUpdater((id: string, field: string, value: string, person?: Person | null, vendor?: Vendor | null) => {
      setEntries((prev) => prev.map((e) => {
        if (e.id !== id) return e;
        if (field === "owner_id") return { ...e, owner_id: value || null, owner: person || null } as RaidRow;
        if (field === "vendor_id") return { ...e, vendor_id: value || null, vendor: vendor || null } as RaidRow;
        if (field === "status") return { ...e, status: value as ItemStatus, ...(["complete", "closed", "mitigated"].includes(value) ? {} : { resolved_at: null }) } as RaidRow;
        if (field === "decision_date") return { ...e, decision_date: value || null } as RaidRow;
        return { ...e, [field]: value || null } as RaidRow;
      }));
    });
  }, [registerUpdater]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RaidType>("risk");
  const [showArchived, setShowArchived] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: "above" | "nest" | "below" } | null>(null);
  const [addingType, setAddingType] = useState<RaidType | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<PriorityLevel>("medium");
  const [visibleCols, setVisibleCols] = useState<RaidColumnKey[]>(loadRaidColumns);
  const [showColPicker, setShowColPicker] = useState(false);
  const [filterPriority, setFilterPriority] = useState<PriorityLevel | "">("");
  const [filterStatus, setFilterStatus] = useState<ItemStatus | "">("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const colPickerRef = useRef<HTMLDivElement>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveProjects, setMoveProjects] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [moveTargetId, setMoveTargetId] = useState("");
  const supabase = createClient();

  const hasActiveFilters = filterPriority || filterStatus || filterOwner || filterAge || searchFilter;

  function applyFilters(items: RaidRow[]): RaidRow[] {
    let filtered = items;
    if (filterPriority) filtered = filtered.filter((e) => e.priority === filterPriority);
    if (filterStatus) filtered = filtered.filter((e) => e.status === filterStatus);
    if (filterOwner) {
      if (filterOwner === "__unassigned__") {
        filtered = filtered.filter((e) => !e.owner_id);
      } else {
        filtered = filtered.filter((e) => e.owner_id === filterOwner);
      }
    }
    if (filterAge) {
      filtered = filtered.filter((e) => {
        const age = ageFromDate(e.first_flagged_at);
        switch (filterAge) {
          case "today": return age === 0;
          case "1-3": return age >= 1 && age <= 3;
          case "4-7": return age >= 4 && age <= 7;
          case "8-14": return age >= 8 && age <= 14;
          case "15+": return age >= 15;
          default: return true;
        }
      });
    }
    if (searchFilter) {
      const lower = searchFilter.toLowerCase();
      filtered = filtered.filter((e) => {
        const text = [e.title, e.description, e.impact, e.owner?.full_name, e.vendor?.name].filter(Boolean).join(" ").toLowerCase();
        return text.includes(lower);
      });
    }
    return filtered;
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false);
    }
    if (showColPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColPicker]);

  function toggleColumn(key: RaidColumnKey) {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(RAID_COL_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function renderColumnCell(entry: RaidRow, col: RaidColumnKey) {
    const badge = statusBadge(entry.status);
    const age = ageFromDate(entry.first_flagged_at);
    switch (col) {
      case "priority":
        return (
          <div className="w-[68px] flex-shrink-0 flex justify-end">
            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(entry.priority)}`}>{priorityLabel(entry.priority)}</span>
          </div>
        );
      case "status": {
        const statusLabel = entry.raid_type === "decision" && entry.status === "complete" ? "Final" : badge.label;
        const statusClass = entry.raid_type === "decision" && entry.status === "complete" ? "text-green-700 bg-green-100" : badge.className;
        return (
          <div className="w-[88px] flex-shrink-0 flex justify-end">
            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${statusClass}`}>{statusLabel}</span>
          </div>
        );
      }
      case "owner":
        return (
          <div className="w-[150px] flex-shrink-0 flex justify-end">
            {entry.owner ? (
              <div className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                  {entry.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </span>
                <span className="text-xs text-gray-600 truncate">{entry.owner.full_name}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 italic">Unassigned</span>
            )}
          </div>
        );
      case "reporter":
        return (
          <div className="w-[150px] flex-shrink-0 flex justify-end">
            {entry.reporter ? (
              <div className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-[9px] font-medium text-purple-700 flex items-center justify-center flex-shrink-0">
                  {entry.reporter.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </span>
                <span className="text-xs text-gray-600 truncate">{entry.reporter.full_name}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 italic">—</span>
            )}
          </div>
        );
      case "vendor":
        return (
          <div className="w-[100px] flex-shrink-0 text-right">
            <span className="text-xs text-gray-600 truncate block">{entry.vendor?.name || "—"}</span>
          </div>
        );
      case "stage": {
        const stageLabel = entry.stage === "pre_launch" ? "Pre-Launch" : entry.stage === "post_launch" ? "Post-Launch" : "—";
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[88px] text-right">{stageLabel}</span>;
      }
      case "age":
        return <span className="text-xs text-gray-500 font-medium flex-shrink-0 w-12 text-right">{formatAge(age)}</span>;
      case "first_flagged":
        return <span className="text-xs text-gray-500 flex-shrink-0 w-[80px] text-right">{new Date(entry.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
    }
  }

  function saveField(id: string, field: string, value: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    const dbUpdates: Record<string, unknown> = {};

    if (field === "raid_type") {
      const newType = value as RaidType;
      const prefix = typePrefix[newType];
      const existingOfType = entries.filter((e) => e.raid_type === newType && e.id !== id);
      const maxNum = existingOfType.reduce((max, e) => {
        const num = parseInt(e.display_id.slice(1));
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      const newDisplayId = `${prefix}${maxNum + 1}`;
      dbUpdates.raid_type = newType;
      dbUpdates.display_id = newDisplayId;
      if (newType !== "decision") dbUpdates.decision_date = null;
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, raid_type: newType, display_id: newDisplayId, ...(newType !== "decision" ? { decision_date: null } : {}) } as RaidRow : e));
    } else if (field === "owner_id") {
      const newOwner = people.find((p) => p.id === value) || null;
      dbUpdates.owner_id = value || null;
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, owner_id: value || null, owner: newOwner } as RaidRow : e));
    } else if (field === "reporter_id") {
      const newReporter = people.find((p) => p.id === value) || null;
      dbUpdates.reporter_id = value || null;
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, reporter_id: value || null, reporter: newReporter } as RaidRow : e));
    } else if (field === "vendor_id") {
      const newVendor = vendors.find((v) => v.id === value) || null;
      dbUpdates.vendor_id = value || null;
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, vendor_id: value || null, vendor: newVendor } as RaidRow : e));
    } else {
      dbUpdates[field] = value || null;
      const resolvedStatuses = entry.raid_type === "risk" ? ["closed", "mitigated"] : ["complete", "closed"];
      if (field === "status" && !resolvedStatuses.includes(value)) {
        dbUpdates.resolved_at = null;
        setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value || null, resolved_at: null } as RaidRow : e));
      } else {
        setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value || null } as RaidRow : e));
      }
    }

    supabase.from("raid_entries").update(dbUpdates).eq("id", id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
  }

  async function convertToActionItem(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const { data, error } = await supabase.from("action_items").insert({
      org_id: project.org_id,
      title: entry.title,
      description: entry.description || null,
      notes: entry.impact || null,
      owner_id: entry.owner_id || null,
      vendor_id: entry.vendor_id || null,
      project_id: entry.project_id || null,
      priority: entry.priority,
      status: entry.status === "identified" || entry.status === "assessing" ? "pending" : entry.status,
      first_flagged_at: entry.first_flagged_at,
      created_by: profileId,
    }).select("id").single();
    if (error) { console.error("Convert failed:", error); return; }
    await supabase.from("comments").update({ action_item_id: data.id, raid_entry_id: null }).eq("raid_entry_id", id);
    await supabase.from("raid_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setExpandedId(null);
    onConvertedToAction?.(data.id);
  }

  async function convertToBlocker(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const { data, error } = await supabase.from("blockers").insert({
      org_id: project.org_id,
      title: entry.title,
      description: entry.description || null,
      impact_description: entry.impact || null,
      owner_id: entry.owner_id || null,
      vendor_id: entry.vendor_id || null,
      project_id: entry.project_id || null,
      priority: entry.priority,
      status: entry.status === "identified" || entry.status === "assessing" ? "pending" : entry.status,
      first_flagged_at: entry.first_flagged_at,
      created_by: profileId,
    }).select("id").single();
    if (error) { console.error("Convert failed:", error); return; }
    await supabase.from("comments").update({ blocker_id: data.id, raid_entry_id: null }).eq("raid_entry_id", id);
    await supabase.from("raid_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setExpandedId(null);
    onConvertedToBlocker?.(data.id);
  }

  function toggleMeeting(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const newVal = !entry.include_in_meeting;
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, include_in_meeting: newVal } : e));
    supabase.from("raid_entries").update({ include_in_meeting: newVal }).eq("id", id).then(({ error }) => {
      if (error) console.error("Toggle failed:", error);
      else onMeetingToggle?.();
    });
  }

  const risks = activeEntries.filter((r) => r.raid_type === "risk");
  const assumptions = activeEntries.filter((r) => r.raid_type === "assumption");
  const issues = activeEntries.filter((r) => r.raid_type === "issue");
  const decisions = activeEntries.filter((r) => r.raid_type === "decision");

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleResolve(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || resolvingId) return;
    setResolvingId(id);
    if (expandedId === id) setExpandedId(null);

    const prevStatus = entry.status;
    const now = new Date().toISOString();
    const resolveStatus = entry.raid_type === "risk" ? "closed" : "complete";

    // Start DB update in parallel with animation
    const dbPromise = supabase.from("raid_entries").update({ status: resolveStatus, resolved_at: now }).eq("id", id);
    // Wait for animation
    await new Promise((r) => setTimeout(r, 400));
    const { error } = await dbPromise;

    setResolvingId(null);
    if (!error) {
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: resolveStatus as ItemStatus, resolved_at: now } : e));
      addUndo(`Resolved "${entry.title}"`, async () => {
        const { error: err } = await supabase.from("raid_entries").update({ status: prevStatus, resolved_at: null }).eq("id", id);
        if (!err) setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: prevStatus, resolved_at: null } : e));
      });
    }
  }

  async function handleReopen(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const newStatus = entry.raid_type === "risk" ? "identified" : "pending";
    const { error } = await supabase.from("raid_entries").update({ status: newStatus, resolved_at: null }).eq("id", id);
    if (!error) {
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: newStatus as ItemStatus, resolved_at: null } : e));
    }
  }

  async function handleDelete(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const { error } = await supabase.from("raid_entries").delete().eq("id", id);
    if (!error) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (expandedId === id) setExpandedId(null);
      const { owner: _o, reporter: _r, vendor: _v, ...dbFields } = entry;
      addUndo(`Deleted "${entry.title}"`, async () => {
        const { error: err } = await supabase.from("raid_entries").insert(dbFields);
        if (!err) setEntries((prev) => [...prev, entry]);
      });
    }
  }

  async function startMove(id: string) {
    const { data } = await supabase.from("projects").select("id, name, slug").order("name");
    const others = (data || []).filter((p: { id: string }) => p.id !== project.id);
    setMoveProjects(others);
    setMoveTargetId("");
    setMovingId(id);
  }

  async function confirmMove() {
    if (!movingId || !moveTargetId) return;
    const entry = entries.find((e) => e.id === movingId);
    if (!entry) return;
    const { error } = await supabase.from("raid_entries").update({ project_id: moveTargetId, parent_id: null }).eq("id", movingId);
    if (!error) {
      // Also move children
      const children = entries.filter((e) => e.parent_id === movingId);
      if (children.length > 0) {
        await supabase.from("raid_entries").update({ project_id: moveTargetId }).in("id", children.map((c) => c.id));
      }
      setEntries((prev) => prev.filter((e) => e.id !== movingId && e.parent_id !== movingId));
      if (expandedId === movingId) setExpandedId(null);
      const targetName = moveProjects.find((p) => p.id === moveTargetId)?.name || "another project";
      addUndo(`Moved "${entry.title}" to ${targetName}`, async () => {
        await supabase.from("raid_entries").update({ project_id: project.id, parent_id: entry.parent_id }).eq("id", movingId);
        if (children.length > 0) {
          await supabase.from("raid_entries").update({ project_id: project.id }).in("id", children.map((c) => c.id));
        }
        setEntries((prev) => [...prev, entry, ...children]);
      });
    }
    setMovingId(null);
  }

  function handleDragStart(id: string, e: React.DragEvent) {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    }
  }

  function handleDragOver(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const pct = y / h;
    let zone: "above" | "nest" | "below";
    if (pct < 0.25) zone = "above";
    else if (pct > 0.75) zone = "below";
    else zone = "nest";
    setDropTarget({ id: targetId, zone });
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDropTarget(null);
  }

  async function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId || !dropTarget) return;
    const zone = dropTarget.zone;
    const draggedEntry = entries.find((e) => e.id === draggedId);
    const targetEntry = entries.find((e) => e.id === targetId);
    if (!draggedEntry || !targetEntry) return;

    let newParentId: string | null = null;
    let newSortOrder = targetEntry.sort_order;

    if (zone === "nest") {
      // Don't allow nesting under own children
      const isDescendant = (parentId: string, childId: string): boolean => {
        const children = entries.filter((e) => e.parent_id === parentId);
        return children.some((c) => c.id === childId || isDescendant(c.id, childId));
      };
      if (isDescendant(draggedId, targetId)) return;
      newParentId = targetId;
      // Place at end of children
      const children = entries.filter((e) => e.parent_id === targetId && e.id !== draggedId);
      newSortOrder = children.length > 0 ? Math.max(...children.map((c) => c.sort_order)) + 1000 : 1000;
      setExpandedParents((prev) => new Set([...prev, targetId]));
    } else {
      // above/below — sibling of target
      newParentId = targetEntry.parent_id;
      // Get siblings sorted
      const siblings = entries
        .filter((e) => e.parent_id === newParentId && e.raid_type === targetEntry.raid_type && e.id !== draggedId && !e.resolved_at)
        .sort((a, b) => a.sort_order - b.sort_order);
      const targetIdx = siblings.findIndex((e) => e.id === targetId);
      if (zone === "above") {
        const prev = targetIdx > 0 ? siblings[targetIdx - 1].sort_order : targetEntry.sort_order - 1000;
        newSortOrder = Math.floor((prev + targetEntry.sort_order) / 2);
      } else {
        const next = targetIdx < siblings.length - 1 ? siblings[targetIdx + 1].sort_order : targetEntry.sort_order + 1000;
        newSortOrder = Math.floor((targetEntry.sort_order + next) / 2);
      }
    }

    // Update DB
    const { error } = await supabase.from("raid_entries").update({ parent_id: newParentId, sort_order: newSortOrder }).eq("id", draggedId);
    if (!error) {
      setEntries((prev) => prev.map((e) => e.id === draggedId ? { ...e, parent_id: newParentId, sort_order: newSortOrder } : e));
    }

    setDraggedId(null);
    setDropTarget(null);
  }

  async function handleAdd() {
    if (!addTitle.trim() || !addingType) return;
    const prefix = typePrefix[addingType];
    const existingOfType = entries.filter((e) => e.raid_type === addingType);
    const maxNum = existingOfType.reduce((max, e) => {
      const num = parseInt(e.display_id.slice(1));
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const displayId = `${prefix}${maxNum + 1}`;

    const maxSort = existingOfType.reduce((max, e) => Math.max(max, e.sort_order || 0), 0);
    const newEntry = {
      title: addTitle.trim(),
      raid_type: addingType,
      display_id: displayId,
      priority: addPriority,
      status: (addingType === "risk" ? "identified" : "pending") as ItemStatus,
      project_id: project.id,
      org_id: project.org_id,
      owner_id: null,
      vendor_id: null,
      impact: null,
      description: null,
      decision_date: null,
      sort_order: maxSort + 1000,
      created_by: profileId,
    };

    const { data, error } = await supabase.from("raid_entries").insert(newEntry).select("*, owner:people!raid_entries_owner_id_fkey(*), reporter:people!raid_entries_reporter_id_fkey(*), vendor:vendors(*)").single();
    if (!error && data) {
      setEntries((prev) => [data as RaidRow, ...prev]);
      setAddTitle("");
      setAddPriority("medium");
      setAddingType(null);
    }
  }

  function renderQuadrant(label: string, raidType: RaidType, allItems: RaidRow[]) {
    const items = applyFilters(allItems);
    const statusesForType = raidType === "decision" ? decisionStatusOptions : raidType === "risk" ? riskStatusOptions : statusOptions;
    // Collect unique owners from unfiltered items for the filter dropdown
    const ownerOptions = Array.from(
      new Map(allItems.filter((e) => e.owner).map((e) => [e.owner!.id, e.owner!.full_name])).entries()
    ).sort((a, b) => a[1].localeCompare(b[1]));
    const filteredCount = items.length !== allItems.length;
    return (
      <div className="rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-700 px-4 h-9 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
            {label} ({filteredCount ? `${items.length}/${allItems.length}` : allItems.length})
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative" ref={colPickerRef}>
              <button
                onClick={() => setShowColPicker((p) => !p)}
                className="text-white hover:text-gray-300 transition-colors"
                title="Configure columns"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-20 py-1 w-44">
                  {RAID_COLUMNS.map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={visibleCols.includes(col.key)}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {canCreate(role) && (
              <button
                onClick={() => { setAddingType(addingType === raidType ? null : raidType); setAddTitle(""); setAddPriority("medium"); }}
                className="text-xs text-blue-300 hover:text-white transition-colors"
              >
                + Add {label.slice(0, -1)}
              </button>
            )}
          </div>
        </div>
        {addingType === raidType && (
          <div className="bg-blue-50 border-b border-blue-200 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addTitle.trim()) handleAdd(); if (e.key === "Escape") setAddingType(null); }}
                placeholder={`New ${label.slice(0, -1).toLowerCase()} title...`}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <select
                value={addPriority}
                onChange={(e) => setAddPriority(e.target.value as PriorityLevel)}
                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
              >
                {priorityOptions.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={!addTitle.trim()}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                onClick={() => setAddingType(null)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {/* Filter bar */}
        {allItems.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-3 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mr-1">Filters</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value as PriorityLevel | "")}
                className={`rounded border px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none ${filterPriority ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
              >
                <option value="">Priority</option>
                {priorityOptions.map((p) => (
                  <option key={p} value={p}>{priorityLabel(p)}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ItemStatus | "")}
                className={`rounded border px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none ${filterStatus ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
              >
                <option value="">Status</option>
                {statusesForType.map((s) => (
                  <option key={s} value={s}>{raidType === "decision" && s === "complete" ? "Final" : s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                ))}
              </select>
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className={`rounded border px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none ${filterOwner ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
              >
                <option value="">Owner</option>
                <option value="__unassigned__">Unassigned</option>
                {ownerOptions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <select
                value={filterAge}
                onChange={(e) => setFilterAge(e.target.value)}
                className={`rounded border px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none ${filterAge ? "border-blue-400 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
              >
                <option value="">Age</option>
                <option value="today">Today</option>
                <option value="1-3">1–3 days</option>
                <option value="4-7">4–7 days</option>
                <option value="8-14">1–2 weeks</option>
                <option value="15+">2+ weeks</option>
              </select>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterPriority(""); setFilterStatus(""); setFilterOwner(""); setFilterAge(""); }}
                  className="text-[10px] text-gray-400 hover:text-red-500 ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
        {items.length === 0 && allItems.length > 0 && hasActiveFilters ? (
          <p className="text-sm text-gray-400 p-4">No items match filters.</p>
        ) : items.length === 0 && addingType !== raidType ? (
          <p className="text-sm text-gray-400 p-4">None</p>
        ) : items.length === 0 ? null : (
          <div>
            <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
              <div className="flex items-center gap-4">
                <div className="flex-1" />
                {RAID_COLUMNS.filter((c) => visibleCols.includes(c.key)).map((col) => (
                  <span key={col.key} className={`text-[10px] font-medium text-gray-400 uppercase tracking-wide ${col.width} text-right`}>
                    {col.label}
                  </span>
                ))}
              </div>
            </div>
            {(() => {
              // Build ordered list: parents followed by their children
              const parentItems = items.filter((e) => !e.parent_id).sort((a, b) => {
                // Closed risks go to the bottom
                const aClosed = a.status === "closed" ? 1 : 0;
                const bClosed = b.status === "closed" ? 1 : 0;
                if (aClosed !== bClosed) return aClosed - bClosed;
                return a.sort_order - b.sort_order;
              });
              const childMap = new Map<string, RaidRow[]>();
              for (const e of items) {
                if (e.parent_id) {
                  const siblings = childMap.get(e.parent_id) || [];
                  siblings.push(e);
                  childMap.set(e.parent_id, siblings);
                }
              }
              // Sort children within each parent
              for (const [key, children] of childMap) {
                childMap.set(key, children.sort((a, b) => a.sort_order - b.sort_order));
              }
              const ordered: { entry: RaidRow; isChild: boolean }[] = [];
              for (const p of parentItems) {
                ordered.push({ entry: p, isChild: false });
                if (expandedParents.has(p.id)) {
                  const children = childMap.get(p.id);
                  if (children) children.forEach((c) => ordered.push({ entry: c, isChild: true }));
                }
              }
              // Include orphaned children (parent filtered out or in different type — not just collapsed)
              for (const e of items) {
                if (e.parent_id && !ordered.some((o) => o.entry.id === e.id) && !parentItems.some((p) => p.id === e.parent_id)) {
                  ordered.push({ entry: e, isChild: true });
                }
              }
              return ordered;
            })().map(({ entry, isChild }) => {
              const isExpanded = expandedId === entry.id;
              const badge = statusBadge(entry.status);
              const age = ageFromDate(entry.first_flagged_at);
              const isResolving = resolvingId === entry.id;
              const childCount = items.filter((e) => e.parent_id === entry.id).length;

              const isClosed = entry.status === "closed";
              const isDragging = draggedId === entry.id;
              const isDropNest = dropTarget?.id === entry.id && dropTarget.zone === "nest";
              const isDropAbove = dropTarget?.id === entry.id && dropTarget.zone === "above";
              const isDropBelow = dropTarget?.id === entry.id && dropTarget.zone === "below";

              return (
                <Fragment key={entry.id}>
                  {/* Collapsed row */}
                  <div
                    className={`border-b last:border-b-0 cursor-pointer relative overflow-hidden ${isResolving ? "bg-green-100 opacity-0 border-transparent" : isDragging ? "opacity-40 bg-white border-gray-400" : isDropNest ? "bg-blue-50 border-blue-300" : isClosed ? "bg-gray-50 hover:bg-gray-100 border-gray-400" : "bg-white hover:bg-gray-50 border-gray-400"}`}
                    style={{ transition: isResolving ? "all 350ms ease-out" : undefined, paddingLeft: isChild ? "2rem" : "0.75rem", paddingRight: "0.75rem", ...(isResolving ? { maxHeight: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" } : { maxHeight: 200, paddingTop: "0.5rem", paddingBottom: "0.5rem" }) }}
                    onClick={() => toggleExpand(entry.id)}
                    draggable={entry.raid_type !== "decision"}
                    onDragStart={entry.raid_type !== "decision" ? (e) => handleDragStart(entry.id, e) : undefined}
                    onDragOver={entry.raid_type !== "decision" ? (e) => handleDragOver(entry.id, e) : undefined}
                    onDragEnd={entry.raid_type !== "decision" ? handleDragEnd : undefined}
                    onDrop={entry.raid_type !== "decision" ? () => handleDrop(entry.id) : undefined}
                    onDragLeave={entry.raid_type !== "decision" ? () => { if (dropTarget?.id === entry.id) setDropTarget(null); } : undefined}
                  >
                    {/* Drop indicator lines */}
                    {isDropAbove && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 -translate-y-px z-10" />}
                    {isDropBelow && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 translate-y-px z-10" />}
                    <div className={`flex items-center gap-4 min-w-0 ${isClosed ? "opacity-50" : ""}`}>
                      {isChild && (
                        <span className="text-gray-300 flex-shrink-0 -ml-2 mr--2">↳</span>
                      )}
                      {/* Subtask toggle — not for decisions */}
                      {entry.raid_type !== "decision" && (
                        childCount > 0 ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedParents((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              });
                            }}
                            className="flex items-center gap-1 text-[10px] text-[#000000] hover:text-[#000000] flex-shrink-0 transition-colors w-[20px] justify-center"
                            title={expandedParents.has(entry.id) ? "Hide subtasks" : "Show subtasks"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform ${expandedParents.has(entry.id) ? "rotate-90" : ""}`}>
                              <polygon points="6,4 20,12 6,20" />
                            </svg>
                          </button>
                        ) : (
                          <span className="w-[20px] flex-shrink-0" />
                        )
                      )}
                      {/* Complete button — not for decisions */}
                      {entry.raid_type !== "decision" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResolve(entry.id); }}
                          className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group/check"
                          title="Resolve"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-transparent group-hover/check:text-green-500 transition-colors">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      )}
                      {/* Meeting toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMeeting(entry.id); }}
                        className={`p-0.5 rounded transition-colors flex-shrink-0 ${entry.include_in_meeting ? "text-blue-600" : "text-gray-400 hover:text-gray-500"}`}
                        title={entry.include_in_meeting ? "Remove from meeting" : "Include in meeting"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={entry.include_in_meeting ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      </button>
                      {/* Title — inline editable for decisions */}
                      {entry.raid_type === "decision" ? (
                        <span className="text-sm font-semibold min-w-0 flex-1 truncate" onClick={(e) => e.stopPropagation()}>
                          <InlineText value={entry.title} onSave={(v) => { if (v.trim()) saveField(entry.id, "title", v.trim()); }} placeholder="Decision title..." />
                        </span>
                      ) : (
                        <span className={`text-sm font-semibold truncate min-w-0 flex-1 ${isChild ? "text-gray-700" : "text-gray-900"}`}>{entry.title}</span>
                      )}
                      {childCount > 0 && (
                        <span className="text-[10px] text-[#000000] bg-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{childCount}</span>
                      )}
                      {/* Metadata — dynamic columns */}
                      {visibleCols.map((col) => (
                        <Fragment key={col}>{renderColumnCell(entry, col)}</Fragment>
                      ))}
                      {intakeSourceMap[entry.id] && (
                        <a
                          href={`/intake/${intakeSourceMap[entry.id]}/review`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex-shrink-0"
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail — inline editable */}
                  {isExpanded && (
                    <div className="bg-white border-b border-gray-200" onClick={(e) => e.stopPropagation()}>
                      {/* Editable title */}
                      <div className="px-5 pt-4 pb-3 text-base font-semibold text-gray-900 bg-amber-50/60">
                        <InlineText value={entry.title} onSave={(v) => { if (v.trim()) saveField(entry.id, "title", v.trim()); }} placeholder="Title..." />
                      </div>

                      {/* Description & Notes — side by side */}
                      <div className="grid grid-cols-2 gap-4 px-5 py-3 border-t border-gray-200">
                        <div className="rounded border border-gray-200 p-3">
                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
                          <InlineText value={entry.description || ""} onSave={(v) => saveField(entry.id, "description", v)} multiline placeholder="Add description..." />
                        </div>
                        <div className="rounded border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Notes</span>
                          </div>
                          <textarea
                            value={entry.notes || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEntries((prev) => prev.map((en) => en.id === entry.id ? { ...en, notes: v } : en));
                            }}
                            placeholder="Add notes..."
                            rows={3}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
                          />
                          {(entry.notes || "").trim() && (
                            <div className="flex justify-end mt-1.5">
                              <button
                                onClick={() => saveField(entry.id, "notes", entry.notes || "")}
                                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                              >
                                Update
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Properties grid */}
                      <div className="border-t border-gray-200">
                        {entry.raid_type === "decision" ? (
                          /* Simplified decision detail panel */
                          <div className="grid grid-cols-[120px_1fr_120px_1fr] items-stretch">
                            {/* Row: Status / Owner */}
                            <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Status</span>
                            <div className="px-3 py-2.5 border-b border-gray-200">
                              <select
                                value={entry.status}
                                onChange={(e) => saveField(entry.id, "status", e.target.value)}
                                className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                              >
                                {decisionStatusOptions.map((s) => (
                                  <option key={s} value={s}>{s === "complete" ? "Final" : "Pending"}</option>
                                ))}
                              </select>
                            </div>
                            <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Owner</span>
                            <div className="px-3 py-1.5 border-b border-gray-200">
                              <OwnerPicker
                                value={entry.owner_id || ""}
                                onChange={(id) => saveField(entry.id, "owner_id", id)}
                                people={people}
                                onPersonAdded={onPersonAdded}
                              />
                            </div>

                            {/* Row: Decision Date */}
                            <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Decision Date</span>
                            <div className="px-3 py-2.5 border-b border-gray-200 col-span-3">
                              <InlineDate value={entry.decision_date} onSave={(v) => saveField(entry.id, "decision_date", v)} />
                            </div>
                          </div>
                        ) : (
                          /* Full detail panel for risks, assumptions, issues */
                          <div className="grid grid-cols-[120px_1fr_120px_1fr] items-stretch">
                          {/* Row: Type / Priority */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Type</span>
                          <div className="px-3 py-2.5 border-b border-gray-200">
                            <select
                              value={entry.raid_type}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "__action_item") { convertToActionItem(entry.id); return; }
                                if (val === "__blocker") { convertToBlocker(entry.id); return; }
                                saveField(entry.id, "raid_type", val);
                              }}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              {raidTypes.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                              <option disabled className="text-gray-300">────────────</option>
                              <option value="__action_item">Action Item</option>
                              <option value="__blocker">Blocker</option>
                            </select>
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Priority</span>
                          <div className="px-3 py-2.5 border-b border-gray-200">
                            <select
                              value={entry.priority}
                              onChange={(e) => saveField(entry.id, "priority", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              {priorityOptions.map((p) => (
                                <option key={p} value={p}>{priorityLabel(p)}</option>
                              ))}
                            </select>
                          </div>

                          {/* Row: Status / Owner */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Status</span>
                          <div className="px-3 py-2.5 border-b border-gray-200">
                            <select
                              value={entry.status}
                              onChange={(e) => saveField(entry.id, "status", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              {(entry.raid_type === "risk" ? riskStatusOptions : statusOptions).map((s) => (
                                <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                              ))}
                            </select>
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Owner</span>
                          <div className="px-3 py-1.5 border-b border-gray-200">
                            <OwnerPicker
                              value={entry.owner_id || ""}
                              onChange={(id) => saveField(entry.id, "owner_id", id)}
                              people={people}
                              onPersonAdded={onPersonAdded}
                            />
                          </div>

                          {/* Row: Reporter / Vendor */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Reporter</span>
                          <div className="px-3 py-1.5 border-b border-gray-200">
                            <OwnerPicker
                              value={entry.reporter_id || ""}
                              onChange={(id) => saveField(entry.id, "reporter_id", id)}
                              people={people}
                              onPersonAdded={onPersonAdded}
                            />
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Vendor</span>
                          <div className="px-3 py-1.5 border-b border-gray-200">
                            <VendorPicker
                              value={entry.vendor_id || ""}
                              onChange={(id) => saveField(entry.id, "vendor_id", id)}
                              vendors={vendors}
                              onVendorAdded={onVendorAdded}
                            />
                          </div>

                          {/* Row: Opened / Impact */}
                          {/* Row: Opened / Impact */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Opened</span>
                          <div className="px-3 py-2.5 border-b border-gray-200">
                            <span className="text-sm text-gray-700">{new Date(entry.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Impact</span>
                          <div className="px-3 py-2.5 border-b border-gray-200">
                            <select
                              value={entry.impact || ""}
                              onChange={(e) => saveField(entry.id, "impact", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              <option value="">None</option>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>

                          {/* Row: Parent / Stage */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Parent</span>
                          <div className={`px-3 py-2.5 border-b border-gray-200${entry.raid_type !== "issue" ? " col-span-3" : ""}`}>
                            <select
                              value={entry.parent_id || ""}
                              onChange={(e) => saveField(entry.id, "parent_id", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5 max-w-full"
                            >
                              <option value="">None</option>
                              {entries.filter((e) => e.id !== entry.id && e.raid_type === entry.raid_type && !e.parent_id && !e.resolved_at).map((e) => {
                                const label = `${e.display_id} — ${e.title}`;
                                return <option key={e.id} value={e.id}>{label.length > 75 ? label.slice(0, 75) + "…" : label}</option>;
                              })}
                            </select>
                          </div>
                          {entry.raid_type === "issue" && (
                            <>
                              <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Stage</span>
                              <div className="px-3 py-2.5 border-b border-gray-200">
                                <select
                                  value={entry.stage || ""}
                                  onChange={(e) => saveField(entry.id, "stage", e.target.value)}
                                  className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                                >
                                  <option value="">None</option>
                                  <option value="pre_launch">Pre-Launch</option>
                                  <option value="post_launch">Post-Launch</option>
                                </select>
                              </div>
                            </>
                          )}

                          {entry.resolved_at && (
                            <>
                              <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Resolved</span>
                              <div className="px-3 py-2.5 border-b border-gray-200 col-span-3">
                                <span className="text-sm text-gray-700">{formatDateShort(entry.resolved_at)}</span>
                              </div>
                            </>
                          )}
                          </div>
                        )}
                      </div>

                      {/* Comments */}
                      <CommentThread
                        raidEntryId={entry.id}
                        orgId={project.org_id}
                        people={people}
                      />

                      {/* Actions bar */}
                      <div className="flex justify-end items-center gap-3 px-5 py-2 border-t border-gray-200">
                        <button
                          onClick={() => startMove(entry.id)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Move to another project"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          </svg>
                        </button>
                        {canDelete(role) && (
                          <button
                            onClick={() => handleDelete(entry.id)}
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
            })}
          </div>
        )}
      </div>
    );
  }

  const tabs: { type: RaidType; label: string; items: RaidRow[] }[] = [
    { type: "risk", label: "Risks", items: risks },
    { type: "assumption", label: "Assumptions", items: assumptions },
    { type: "issue", label: "Issues", items: issues },
    { type: "decision", label: "Decisions", items: decisions },
  ];

  const activeItems = tabs.find((t) => t.type === activeTab)!;

  const typeLabel: Record<RaidType, string> = { risk: "Risk", assumption: "Assumption", issue: "Issue", decision: "Decision" };

  function renderArchived() {
    return (
      <div className="rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-700 px-4 h-9 flex items-center">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
            Archived ({archivedEntries.length})
          </h3>
        </div>
        {archivedEntries.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No resolved items.</p>
        ) : (
          <div>
            <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[80px]">Type</span>
                <div className="flex-1" />
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[68px] text-right">Priority</span>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[150px] text-right">Owner</span>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[80px] text-right">Resolved</span>
                <span className="w-[68px]" />
              </div>
            </div>
            {archivedEntries.map((entry) => (
              <div key={entry.id} className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xs text-gray-500 font-medium w-[80px] flex-shrink-0">{typeLabel[entry.raid_type]}</span>
                  <span className="text-sm font-semibold text-gray-900 truncate min-w-0">{entry.title}</span>
                  <div className="flex-1" />
                  <div className="w-[68px] flex-shrink-0 flex justify-end">
                    <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(entry.priority)}`}>{priorityLabel(entry.priority)}</span>
                  </div>
                  <div className="w-[150px] flex-shrink-0 flex justify-end">
                    {entry.owner ? (
                      <div className="flex items-center gap-1">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                          {entry.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </span>
                        <span className="text-xs text-gray-600 truncate">{entry.owner.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Unassigned</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 w-[80px] text-right flex-shrink-0">
                    {entry.resolved_at ? new Date(entry.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </span>
                  <div className="w-[68px] flex-shrink-0 flex justify-end">
                    <button
                      onClick={() => handleReopen(entry.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      Reopen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-[10px]">
      {/* Left sidebar tabs */}
      <div className="flex flex-col w-[140px] flex-shrink-0">
        {tabs.map((tab, i) => (
          <button
            key={tab.type}
            onClick={() => { setActiveTab(tab.type); setShowArchived(false); }}
            className={`px-3 text-sm font-medium text-left border border-gray-300 transition-colors ${
              i > 0 ? "-mt-px" : ""
            } ${
              i === 0 ? "rounded-t-lg h-9 flex items-center" : "py-2.5"
            } ${
              i === tabs.length - 1 ? "rounded-b-lg" : ""
            } ${
              !showArchived && activeTab === tab.type
                ? "bg-gray-800 text-white border-gray-800 z-10 relative"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab.label} ({tab.items.length})
          </button>
        ))}
        <button
          onClick={() => setShowArchived(true)}
          className={`mt-3 px-3 text-xs text-left transition-colors ${showArchived ? "text-gray-900 font-medium" : "text-gray-400 hover:text-gray-600"}`}
        >
          Archived ({archivedEntries.length})
        </button>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {showArchived ? renderArchived() : renderQuadrant(activeItems.label, activeItems.type as RaidType, activeItems.items)}
      </div>

      {/* Move modal */}
      {movingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setMovingId(null)}>
          <div className="bg-white rounded-lg shadow-xl w-[400px] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Move to another project</h3>
            <select
              value={moveTargetId}
              onChange={(e) => setMoveTargetId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select project...</option>
              {moveProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setMovingId(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={confirmMove} disabled={!moveTargetId} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">Move</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

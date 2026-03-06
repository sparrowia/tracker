"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { RaidEntry, RaidType, PriorityLevel, ItemStatus, Person, Vendor, Project } from "@/lib/types";
import OwnerPicker from "@/components/owner-picker";
import CommentThread from "@/components/comment-thread";
import VendorPicker from "@/components/vendor-picker";

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
}

const raidTypes: RaidType[] = ["risk", "assumption", "issue", "decision"];
const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const statusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];
const riskStatusOptions: ItemStatus[] = ["identified", "assessing", "in_progress", "mitigated", "closed"];

const typePrefix: Record<RaidType, string> = { risk: "R", assumption: "A", issue: "I", decision: "D" };

type RaidColumnKey = "priority" | "status" | "owner" | "reporter" | "vendor" | "age" | "escalations" | "first_flagged";

const RAID_COLUMNS: { key: RaidColumnKey; label: string; width: string }[] = [
  { key: "priority", label: "Priority", width: "w-[68px]" },
  { key: "status", label: "Status", width: "w-[88px]" },
  { key: "owner", label: "Owner", width: "w-[150px]" },
  { key: "reporter", label: "Reporter", width: "w-[150px]" },
  { key: "vendor", label: "Vendor", width: "w-[100px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "escalations", label: "Escalations", width: "w-[72px]" },
  { key: "first_flagged", label: "Flagged", width: "w-[80px]" },
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

export default function RaidLog({ initialEntries, project, people, vendors, onPersonAdded, onVendorAdded, addUndo, onCountChange, intakeSourceMap = {}, onMeetingToggle }: RaidLogProps) {
  const [entries, setEntries] = useState<RaidRow[]>(initialEntries);

  const activeEntries = entries.filter((e) => !e.resolved_at);
  const archivedEntries = entries.filter((e) => e.resolved_at).sort((a, b) => new Date(b.resolved_at!).getTime() - new Date(a.resolved_at!).getTime());

  useEffect(() => { onCountChange?.(activeEntries.length); }, [activeEntries.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RaidType>("risk");
  const [showArchived, setShowArchived] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
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
  const supabase = createClient();

  const hasActiveFilters = filterPriority || filterStatus || filterOwner || filterAge;

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
      case "status":
        return (
          <div className="w-[88px] flex-shrink-0 flex justify-end">
            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${badge.className}`}>{badge.label}</span>
          </div>
        );
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
      case "age":
        return <span className="text-xs text-gray-500 font-medium flex-shrink-0 w-12 text-right">{formatAge(age)}</span>;
      case "escalations":
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[72px] text-right">{entry.escalation_count > 0 ? `${entry.escalation_count}x` : "None"}</span>;
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
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value || null } as RaidRow : e));
    }

    supabase.from("raid_entries").update(dbUpdates).eq("id", id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
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

  async function handleAdd() {
    if (!addTitle.trim() || !addingType) return;
    const prefix = typePrefix[addingType];
    const existingOfType = entries.filter((e) => e.raid_type === addingType);
    const maxNum = existingOfType.reduce((max, e) => {
      const num = parseInt(e.display_id.slice(1));
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const displayId = `${prefix}${maxNum + 1}`;

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
    const statusesForType = raidType === "risk" ? riskStatusOptions : statusOptions;
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
            <button
              onClick={() => { setAddingType(addingType === raidType ? null : raidType); setAddTitle(""); setAddPriority("medium"); }}
              className="text-xs text-blue-300 hover:text-white transition-colors"
            >
              + Add {label.slice(0, -1)}
            </button>
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
                  <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
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
              const parentItems = items.filter((e) => !e.parent_id);
              const childMap = new Map<string, RaidRow[]>();
              for (const e of items) {
                if (e.parent_id) {
                  const siblings = childMap.get(e.parent_id) || [];
                  siblings.push(e);
                  childMap.set(e.parent_id, siblings);
                }
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

              return (
                <Fragment key={entry.id}>
                  {/* Collapsed row */}
                  <div
                    className={`border-b last:border-b-0 cursor-pointer ${isResolving ? "bg-green-100 opacity-0 border-transparent" : "bg-blue-50 hover:bg-blue-100 border-gray-200"}`}
                    style={{ transition: "all 350ms ease-out", paddingLeft: isChild ? "2rem" : "0.75rem", paddingRight: "0.75rem", ...(isResolving ? { maxHeight: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" } : { maxHeight: 200, paddingTop: "0.5rem", paddingBottom: "0.5rem" }) }}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {isChild && (
                        <span className="text-gray-300 flex-shrink-0 -ml-2 mr--2">↳</span>
                      )}
                      {/* Complete button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(entry.id); }}
                        className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group/check"
                        title="Resolve"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-transparent group-hover/check:text-green-500 transition-colors">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      {/* Subtask toggle (replaces expand chevron) */}
                      {childCount > 0 ? (
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
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0 transition-colors w-[20px] justify-center"
                          title={expandedParents.has(entry.id) ? "Hide subtasks" : "Show subtasks"}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform ${expandedParents.has(entry.id) ? "rotate-90" : ""}`}>
                            <polygon points="6,4 20,12 6,20" />
                          </svg>
                        </button>
                      ) : (
                        <span className="w-[20px] flex-shrink-0" />
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
                      {/* Display ID */}
                      <span className="text-xs font-mono text-gray-400 flex-shrink-0">{entry.display_id}</span>
                      {/* Title */}
                      <span className={`text-sm font-semibold truncate min-w-0 ${isChild ? "text-gray-700" : "text-gray-900"}`}>{entry.title}</span>
                      {childCount > 0 && (
                        <span className="text-[10px] text-gray-400 bg-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">{childCount}</span>
                      )}
                      {/* Spacer */}
                      <div className="flex-1" />
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
                      {/* Title section */}
                      <div className="px-5 pt-4 pb-3 text-base font-semibold text-gray-900">
                        <InlineText value={entry.title} onSave={(v) => saveField(entry.id, "title", v)} />
                      </div>

                      {/* Properties grid */}
                      <div className="border-t border-gray-100">
                        <div className="grid grid-cols-[120px_1fr_120px_1fr] items-center">
                          {/* Row: Type / Priority */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Type</span>
                          <div className="px-3 py-2.5 border-b border-gray-100">
                            <select
                              value={entry.raid_type}
                              onChange={(e) => saveField(entry.id, "raid_type", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              {raidTypes.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-100">Priority</span>
                          <div className="px-3 py-2.5 border-b border-gray-100">
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
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Status</span>
                          <div className="px-3 py-2.5 border-b border-gray-100">
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
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-100">Owner</span>
                          <div className="px-3 py-1.5 border-b border-gray-100">
                            <OwnerPicker
                              value={entry.owner_id || ""}
                              onChange={(id) => saveField(entry.id, "owner_id", id)}
                              people={people}
                              onPersonAdded={onPersonAdded}
                            />
                          </div>

                          {/* Row: Reporter / Vendor */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Reporter</span>
                          <div className="px-3 py-1.5 border-b border-gray-100">
                            <OwnerPicker
                              value={entry.reporter_id || ""}
                              onChange={(id) => saveField(entry.id, "reporter_id", id)}
                              people={people}
                              onPersonAdded={onPersonAdded}
                            />
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-100">Vendor</span>
                          <div className="px-3 py-1.5 border-b border-gray-100">
                            <VendorPicker
                              value={entry.vendor_id || ""}
                              onChange={(id) => saveField(entry.id, "vendor_id", id)}
                              vendors={vendors}
                              onVendorAdded={onVendorAdded}
                            />
                          </div>

                          {/* Row: Flagged / Escalations */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Flagged</span>
                          <div className="px-3 py-2.5 border-b border-gray-100">
                            <span className="text-sm text-gray-700">{new Date(entry.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          </div>
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-100">Escalations</span>
                          <div className="px-3 py-2.5 border-b border-gray-100">
                            <span className="text-sm text-gray-700">{entry.escalation_count > 0 ? `${entry.escalation_count}x` : "None"}</span>
                          </div>

                          {/* Row: Parent */}
                          <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Parent</span>
                          <div className="px-3 py-2.5 border-b border-gray-100 col-span-3">
                            <select
                              value={entry.parent_id || ""}
                              onChange={(e) => saveField(entry.id, "parent_id", e.target.value)}
                              className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5"
                            >
                              <option value="">None</option>
                              {entries.filter((e) => e.id !== entry.id && e.raid_type === entry.raid_type && !e.parent_id && !e.resolved_at).map((e) => (
                                <option key={e.id} value={e.id}>{e.display_id} — {e.title}</option>
                              ))}
                            </select>
                          </div>

                          {/* Conditional: Decision Date / Resolved */}
                          {entry.raid_type === "decision" && (
                            <>
                              <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Decision Date</span>
                              <div className="px-3 py-2.5 border-b border-gray-100 col-span-3">
                                <InlineDate value={entry.decision_date} onSave={(v) => saveField(entry.id, "decision_date", v)} />
                              </div>
                            </>
                          )}
                          {entry.resolved_at && (
                            <>
                              <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-100">Resolved</span>
                              <div className="px-3 py-2.5 border-b border-gray-100 col-span-3">
                                <span className="text-sm text-gray-700">{formatDateShort(entry.resolved_at)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Description & Impact */}
                      <div className="px-5 py-3 space-y-3">
                        {(entry.description || entry.impact) ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
                              <InlineText value={entry.description || ""} onSave={(v) => saveField(entry.id, "description", v)} multiline placeholder="Add description..." />
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Impact</span>
                              <InlineText value={entry.impact || ""} onSave={(v) => saveField(entry.id, "impact", v)} multiline placeholder="Add impact..." />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
                              <InlineText value="" onSave={(v) => saveField(entry.id, "description", v)} multiline placeholder="Add description..." />
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Impact</span>
                              <InlineText value="" onSave={(v) => saveField(entry.id, "impact", v)} multiline placeholder="Add impact..." />
                            </div>
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
                      <div className="flex justify-end items-center gap-3 px-5 py-2 border-t border-gray-100">
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
      <div className="flex-1">
        {showArchived ? renderArchived() : renderQuadrant(activeItems.label, activeItems.type as RaidType, activeItems.items)}
      </div>
    </div>
  );
}

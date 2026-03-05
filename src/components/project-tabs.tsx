"use client";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor, ProjectAgendaRow, PriorityLevel, ItemStatus, Intake, IntakeSource } from "@/lib/types";
import RaidLog from "@/components/raid-log";
import { AgendaView } from "@/components/agenda-view";
import OwnerPicker from "@/components/owner-picker";
import { useUndo, UndoToast } from "@/components/undo-toast";

type Tab = "actions" | "blockers" | "raid" | "agenda" | "intake";

type SuggestedItem = {
  id: string;
  title: string;
  suggested_type: "action_item" | "blocker" | "risk" | "issue" | "decision" | "assumption";
  priority: PriorityLevel;
  description: string;
  owner_id: string;
};

const SUGGESTED_TYPE_LABELS: Record<string, string> = {
  action_item: "Action Item",
  blocker: "Blocker",
  risk: "Risk",
  issue: "Issue",
  decision: "Decision",
  assumption: "Assumption",
};

const SUGGESTED_TYPE_OPTIONS: SuggestedItem["suggested_type"][] = ["action_item", "blocker", "risk", "issue", "decision", "assumption"];

const TAB_LABELS: Record<Tab, string> = {
  actions: "Action Items",
  blockers: "Blockers",
  raid: "RAID Log",
  agenda: "Meeting Agenda",
  intake: "Intake",
};

const DEFAULT_ORDER: Tab[] = ["actions", "blockers", "raid", "agenda", "intake"];
const STORAGE_KEY = "project-tab-order";

function loadTabOrder(): Tab[] {
  if (typeof window === "undefined") return DEFAULT_ORDER;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Tab[];
      // Validate: must contain exactly the same keys
      if (parsed.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((t) => parsed.includes(t))) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_ORDER;
}

export default function ProjectTabs({
  project,
  blockers,
  actions,
  raidEntries,
  people,
  vendors,
  agendaRows,
  intakes,
  intakeSourceMap = {},
}: {
  project: Project;
  blockers: (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  actions: (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  raidEntries: (RaidEntry & { owner: Person | null; vendor: Vendor | null })[];
  people: Person[];
  vendors: Vendor[];
  agendaRows: ProjectAgendaRow[];
  intakes: Intake[];
  intakeSourceMap?: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [tabOrder, setTabOrder] = useState<Tab[]>(loadTabOrder);
  const urlTab = searchParams.get("tab") as Tab | null;
  const [active, setActive] = useState<Tab>(urlTab && DEFAULT_ORDER.includes(urlTab) ? urlTab : tabOrder[0]);
  const [dragTab, setDragTab] = useState<Tab | null>(null);
  const [dragOverTab, setDragOverTab] = useState<Tab | null>(null);
  const dragStartIndex = useRef<number>(-1);
  const [peopleList, setPeopleList] = useState<Person[]>(people);
  const [tabCounts, setTabCounts] = useState({
    actions: actions.length,
    blockers: blockers.length,
    raid: raidEntries.length,
    agenda: agendaRows.length,
    intake: intakes.length,
  });

  const addPerson = useCallback((person: Person) => {
    setPeopleList((prev) => {
      if (prev.some((p) => p.id === person.id)) return prev;
      return [...prev, person].sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
  }, []);

  const { stack: undoStack, addUndo, removeAction: dismissUndo, performUndo } = useUndo();

  // Staging area for AI-suggested new items
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestedItem[]>([]);

  const onNewItemsSuggested = useCallback((items: { title: string; suggested_type?: string; priority?: string; description?: string }[]) => {
    const mapped: SuggestedItem[] = items.map((item) => ({
      id: crypto.randomUUID(),
      title: item.title,
      suggested_type: (item.suggested_type as SuggestedItem["suggested_type"]) || "action_item",
      priority: (item.priority as PriorityLevel) || "medium",
      description: item.description || "",
      owner_id: "",
    }));
    setPendingSuggestions((prev) => [...prev, ...mapped]);
  }, []);

  function countForTab(key: Tab) {
    return tabCounts[key];
  }

  const setBlockerCount = useCallback((n: number) => setTabCounts((p) => ({ ...p, blockers: n })), []);
  const setActionCount = useCallback((n: number) => setTabCounts((p) => ({ ...p, actions: n })), []);
  const setRaidCount = useCallback((n: number) => setTabCounts((p) => ({ ...p, raid: n })), []);
  const setAgendaCount = useCallback((n: number) => setTabCounts((p) => ({ ...p, agenda: n })), []);
  const setIntakeCount = useCallback((n: number) => setTabCounts((p) => ({ ...p, intake: n })), []);

  function onTabDragStart(e: React.DragEvent, tab: Tab, index: number) {
    setDragTab(tab);
    dragStartIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function onTabDragOver(e: React.DragEvent, overTab: Tab) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragTab && overTab !== dragTab) {
      setDragOverTab(overTab);
    }
  }

  function onTabDrop(e: React.DragEvent, dropTab: Tab) {
    e.preventDefault();
    if (!dragTab || dragTab === dropTab) {
      setDragTab(null);
      setDragOverTab(null);
      return;
    }

    setTabOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragTab);
      const toIdx = next.indexOf(dropTab);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragTab);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

    setDragTab(null);
    setDragOverTab(null);
  }

  function onTabDragEnd() {
    setDragTab(null);
    setDragOverTab(null);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-300">
        {tabOrder.map((tabKey, idx) => {
          const count = countForTab(tabKey);
          const isBlockers = tabKey === "blockers";
          const isDragging = dragTab === tabKey;
          const isDropTarget = dragOverTab === tabKey && dragTab !== tabKey;
          return (
            <button
              key={tabKey}
              draggable
              onDragStart={(e) => onTabDragStart(e, tabKey, idx)}
              onDragOver={(e) => onTabDragOver(e, tabKey)}
              onDrop={(e) => onTabDrop(e, tabKey)}
              onDragEnd={onTabDragEnd}
              onClick={() => setActive(tabKey)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors relative cursor-grab active:cursor-grabbing select-none ${
                active === tabKey
                  ? "text-blue-700 border-b-2 border-blue-600 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              } ${isDragging ? "opacity-40" : ""} ${
                isDropTarget ? "border-l-2 border-l-blue-400" : ""
              }`}
            >
              {TAB_LABELS[tabKey]}
              {count > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  isBlockers && count > 0
                    ? "bg-red-100 text-red-700"
                    : active === tabKey
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Staging area for AI-suggested new items */}
      {pendingSuggestions.length > 0 && (
        <StagingArea
          suggestions={pendingSuggestions}
          setSuggestions={setPendingSuggestions}
          project={project}
          people={peopleList}
          onPersonAdded={addPerson}
          supabase={supabase}
          onAccepted={() => router.refresh()}
        />
      )}

      {/* Tab content */}
      <div className="mt-6">
        {active === "agenda" && (
          <AgendaView project={project} initialItems={agendaRows} onCountChange={setAgendaCount} onNewItemsSuggested={onNewItemsSuggested} />
        )}

        {active === "blockers" && (
          <BlockersPanel blockers={blockers} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setBlockerCount} intakeSourceMap={intakeSourceMap} onNewItemsSuggested={onNewItemsSuggested} />
        )}

        {active === "raid" && (
          <RaidLog initialEntries={raidEntries} project={project} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setRaidCount} intakeSourceMap={intakeSourceMap} />
        )}

        {active === "actions" && (
          <ActionItemsPanel actions={actions} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setActionCount} intakeSourceMap={intakeSourceMap} onNewItemsSuggested={onNewItemsSuggested} />
        )}

        {active === "intake" && (
          <IntakePanel project={project} initialIntakes={intakes} vendors={vendors} onCountChange={setIntakeCount} />
        )}
      </div>
      <UndoToast stack={undoStack} onUndo={performUndo} onDismiss={dismissUndo} />
    </div>
  );
}

const blockerPriorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const blockerStatusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];

type BlockerRow = Blocker & { owner: Person | null; vendor: Vendor | null };

type BlockerColumnKey = "priority" | "status" | "owner" | "vendor" | "due_date" | "age" | "escalations" | "first_flagged";

const BLOCKER_COLUMNS: { key: BlockerColumnKey; label: string; width: string }[] = [
  { key: "priority", label: "Priority", width: "w-[68px]" },
  { key: "status", label: "Status", width: "w-[88px]" },
  { key: "owner", label: "Owner", width: "w-[150px]" },
  { key: "vendor", label: "Vendor", width: "w-[100px]" },
  { key: "due_date", label: "Due Date", width: "w-[80px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "escalations", label: "Escalations", width: "w-[72px]" },
  { key: "first_flagged", label: "Flagged", width: "w-[80px]" },
];

const DEFAULT_BLOCKER_COLS: BlockerColumnKey[] = ["priority", "status", "owner", "due_date", "age"];
const BLOCKER_COL_STORAGE_KEY = "blockers-columns";

function loadBlockerColumns(): BlockerColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_BLOCKER_COLS;
  try {
    const stored = localStorage.getItem(BLOCKER_COL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as BlockerColumnKey[];
      if (parsed.length > 0 && parsed.every((k) => BLOCKER_COLUMNS.some((c) => c.key === k))) return parsed;
    }
  } catch {}
  return DEFAULT_BLOCKER_COLS;
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

function MeetingToggle({ active, onClick }: { active: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-0.5 rounded transition-colors flex-shrink-0 ${active ? "text-blue-600" : "text-gray-400 hover:text-gray-500"}`}
      title={active ? "Remove from meeting" : "Include in meeting"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  );
}

/* ─── Staging Area for AI-Suggested Items ─── */

type SupabaseClient = ReturnType<typeof createClient>;

function StagingArea({
  suggestions,
  setSuggestions,
  project,
  people,
  onPersonAdded,
  supabase,
  onAccepted,
}: {
  suggestions: SuggestedItem[];
  setSuggestions: React.Dispatch<React.SetStateAction<SuggestedItem[]>>;
  project: Project;
  people: Person[];
  onPersonAdded: (person: Person) => void;
  supabase: SupabaseClient;
  onAccepted: () => void;
}) {
  const [accepting, setAccepting] = useState<Set<string>>(new Set());

  function updateSuggestion(id: string, field: keyof SuggestedItem, value: string) {
    setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }

  function dismiss(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  function dismissAll() {
    setSuggestions([]);
  }

  async function accept(item: SuggestedItem) {
    setAccepting((prev) => new Set(prev).add(item.id));
    const now = new Date().toISOString();
    const base = {
      project_id: project.id,
      org_id: project.org_id,
      title: item.title,
      priority: item.priority,
      status: "pending" as const,
      first_flagged_at: now,
      escalation_count: 0,
      include_in_meeting: false,
      ...(item.owner_id ? { owner_id: item.owner_id } : {}),
    };

    let error = null;
    if (item.suggested_type === "action_item") {
      const { error: e } = await supabase.from("action_items").insert({ ...base, description: item.description || null, notes: null });
      error = e;
    } else if (item.suggested_type === "blocker") {
      const { error: e } = await supabase.from("blockers").insert({ ...base, description: item.description || null, impact_description: null });
      error = e;
    } else {
      // RAID types: risk, issue, decision, assumption
      const raidTypeMap: Record<string, string> = { risk: "risk", issue: "issue", decision: "decision", assumption: "assumption" };
      const { error: e } = await supabase.from("raid_entries").insert({
        project_id: project.id,
        org_id: project.org_id,
        raid_type: raidTypeMap[item.suggested_type] || "risk",
        title: item.title,
        description: item.description || null,
        priority: item.priority,
        status: "pending",
        first_flagged_at: now,
        escalation_count: 0,
        include_in_meeting: false,
        ...(item.owner_id ? { owner_id: item.owner_id } : {}),
      });
      error = e;
    }

    if (error) {
      console.error("Failed to create item:", error);
      setAccepting((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    } else {
      setSuggestions((prev) => prev.filter((s) => s.id !== item.id));
      setAccepting((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      onAccepted();
    }
  }

  async function acceptAll() {
    for (const item of suggestions) {
      await accept(item);
    }
  }

  return (
    <div className="mt-4 mb-2 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
      <div className="bg-blue-100 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
            AI Suggested Items ({suggestions.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {suggestions.length > 1 && (
            <>
              <button
                onClick={acceptAll}
                className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 border border-green-300 rounded hover:bg-green-200 transition-colors"
              >
                Accept All
              </button>
              <button
                onClick={dismissAll}
                className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Dismiss All
              </button>
            </>
          )}
        </div>
      </div>
      <div className="divide-y divide-blue-200">
        {suggestions.map((item) => (
          <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
            {/* Editable title */}
            <input
              type="text"
              value={item.title}
              onChange={(e) => updateSuggestion(item.id, "title", e.target.value)}
              className="flex-1 min-w-0 text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
            />
            {/* Type dropdown */}
            <select
              value={item.suggested_type}
              onChange={(e) => updateSuggestion(item.id, "suggested_type", e.target.value)}
              className="text-xs rounded border border-gray-300 bg-white px-1.5 py-1 focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              {SUGGESTED_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{SUGGESTED_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {/* Priority dropdown */}
            <select
              value={item.priority}
              onChange={(e) => updateSuggestion(item.id, "priority", e.target.value)}
              className="text-xs rounded border border-gray-300 bg-white px-1.5 py-1 focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              {(["critical", "high", "medium", "low"] as PriorityLevel[]).map((p) => (
                <option key={p} value={p}>{priorityLabel(p)}</option>
              ))}
            </select>
            {/* Owner picker */}
            <div className="w-[140px] flex-shrink-0">
              <OwnerPicker
                value={item.owner_id}
                onChange={(id) => updateSuggestion(item.id, "owner_id", id)}
                people={people}
                onPersonAdded={onPersonAdded}
              />
            </div>
            {/* Accept button */}
            <button
              onClick={() => accept(item)}
              disabled={accepting.has(item.id)}
              className="p-1 text-green-600 hover:text-green-700 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
              title="Accept"
            >
              {accepting.has(item.id) ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            {/* Dismiss button */}
            <button
              onClick={() => dismiss(item.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Dismiss"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockersPanel({
  blockers: initialBlockers,
  people,
  vendors,
  onPersonAdded,
  addUndo,
  onCountChange,
  intakeSourceMap = {},
  onNewItemsSuggested,
}: {
  blockers: BlockerRow[];
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
  intakeSourceMap?: Record<string, string>;
  onNewItemsSuggested?: (items: { title: string; suggested_type?: string; priority?: string; description?: string }[]) => void;
}) {
  const [blockers, setBlockers] = useState<BlockerRow[]>(initialBlockers);

  useEffect(() => { onCountChange?.(blockers.length); }, [blockers.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [callNotesId, setCallNotesId] = useState<string | null>(null);
  const [callNotes, setCallNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [visibleCols, setVisibleCols] = useState<BlockerColumnKey[]>(loadBlockerColumns);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false);
    }
    if (showColPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColPicker]);

  function toggleColumn(key: BlockerColumnKey) {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(BLOCKER_COL_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function renderColumnCell(b: BlockerRow, col: BlockerColumnKey) {
    const badge = statusBadge(b.status);
    switch (col) {
      case "priority":
        return (
          <div className="w-[68px] flex-shrink-0 flex justify-end">
            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(b.priority)}`}>{priorityLabel(b.priority)}</span>
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
            {b.owner ? (
              <div className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                  {b.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </span>
                <span className="text-xs text-gray-600 truncate">{b.owner.full_name}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 italic">Unassigned</span>
            )}
          </div>
        );
      case "vendor":
        return (
          <div className="w-[100px] flex-shrink-0 text-right">
            <span className="text-xs text-gray-600 truncate block">{b.vendor?.name || "—"}</span>
          </div>
        );
      case "due_date":
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[80px] text-right">{formatDateShort(b.due_date)}</span>;
      case "age":
        return <span className="text-xs text-red-600 font-medium flex-shrink-0 w-12 text-right">{b.age_days != null ? formatAge(b.age_days) : ""}</span>;
      case "escalations":
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[72px] text-right">{b.escalation_count > 0 ? `${b.escalation_count}x` : "None"}</span>;
      case "first_flagged":
        return <span className="text-xs text-gray-500 flex-shrink-0 w-[80px] text-right">{new Date(b.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
    }
  }

  function saveField(id: string, field: string, value: string) {
    const dbUpdates: Record<string, unknown> = {};

    if (field === "owner_id") {
      const newOwner = people.find((p) => p.id === value) || null;
      dbUpdates.owner_id = value || null;
      setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, owner_id: value || null, owner: newOwner } as BlockerRow : b));
    } else if (field === "vendor_id") {
      const newVendor = vendors.find((v) => v.id === value) || null;
      dbUpdates.vendor_id = value || null;
      setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, vendor_id: value || null, vendor: newVendor } as BlockerRow : b));
    } else {
      dbUpdates[field] = value || null;
      setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value || null } as BlockerRow : b));
    }

    supabase.from("blockers").update(dbUpdates).eq("id", id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
  }

  async function saveCallNotes(id: string) {
    const entry = blockers.find((b) => b.id === id);
    if (!entry || !callNotes.trim()) return;

    setSavingNotes(true);
    try {
      const res = await fetch("/api/agenda-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "blocker",
          current: {
            title: entry.title,
            impact_description: entry.impact_description,
            description: entry.description,
            priority: entry.priority,
            status: entry.status,
            due_date: entry.due_date,
          },
          notes: callNotes,
        }),
      });
      if (res.ok) {
        const { updates: aiUpdates, new_items } = await res.json();
        const merged: Record<string, unknown> = {};
        if (aiUpdates.title) merged.title = aiUpdates.title;
        if (aiUpdates.priority) merged.priority = aiUpdates.priority;
        if (aiUpdates.status) merged.status = aiUpdates.status;
        if (aiUpdates.impact_description !== undefined) merged.impact_description = aiUpdates.impact_description;
        if (aiUpdates.description !== undefined) merged.description = aiUpdates.description;
        if (aiUpdates.due_date !== undefined) merged.due_date = aiUpdates.due_date;
        setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, ...merged } as BlockerRow : b));
        setCallNotes("");
        setCallNotesId(null);
        supabase.from("blockers").update(merged).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
        if (new_items?.length > 0 && onNewItemsSuggested) {
          onNewItemsSuggested(new_items);
        }
      }
    } catch (err) {
      console.error("AI save failed:", err);
    } finally {
      setSavingNotes(false);
    }
  }

  function toggleMeeting(id: string) {
    const blocker = blockers.find((b) => b.id === id);
    if (!blocker) return;
    const newVal = !blocker.include_in_meeting;
    setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, include_in_meeting: newVal } : b));
    supabase.from("blockers").update({ include_in_meeting: newVal }).eq("id", id).then(({ error }) => {
      if (error) console.error("Toggle failed:", error);
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleResolve(id: string) {
    const blocker = blockers.find((b) => b.id === id);
    if (!blocker) return;
    const prevStatus = blocker.status;
    const now = new Date().toISOString();
    const { error } = await supabase.from("blockers").update({ status: "complete", resolved_at: now }).eq("id", id);
    if (!error) {
      setBlockers((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) setExpandedId(null);
      addUndo(`Resolved "${blocker.title}"`, async () => {
        const { error: err } = await supabase.from("blockers").update({ status: prevStatus, resolved_at: null }).eq("id", id);
        if (!err) setBlockers((prev) => [...prev, { ...blocker, status: prevStatus, resolved_at: null }]);
      });
    }
  }

  async function handleDelete(id: string) {
    const blocker = blockers.find((b) => b.id === id);
    if (!blocker) return;
    const { error } = await supabase.from("blockers").delete().eq("id", id);
    if (!error) {
      setBlockers((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) setExpandedId(null);
      const { owner: _o, vendor: _v, age_days: _a, age_severity: _s, ...dbFields } = blocker;
      addUndo(`Deleted "${blocker.title}"`, async () => {
        const { error: err } = await supabase.from("blockers").insert(dbFields);
        if (!err) setBlockers((prev) => [...prev, blocker]);
      });
    }
  }

  if (blockers.length === 0) {
    return <p className="text-sm text-gray-500">No active blockers.</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-red-800 px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers ({blockers.length})</h2>
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
              {BLOCKER_COLUMNS.map((col) => (
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
      </div>
      <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
        <div className="flex items-center gap-4">
          <div className="flex-1" />
          {BLOCKER_COLUMNS.filter((c) => visibleCols.includes(c.key)).map((col) => (
            <span key={col.key} className={`text-[10px] font-medium text-gray-400 uppercase tracking-wide ${col.width} text-right`}>
              {col.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        {blockers.map((b) => {
          const isExpanded = expandedId === b.id;
          const badge = statusBadge(b.status);

          return (
            <Fragment key={b.id}>
              {/* Collapsed row */}
              <div
                className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-red-50/40"
                onClick={() => toggleExpand(b.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Complete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleResolve(b.id); }}
                    className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group/check"
                    title="Resolve"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-transparent group-hover/check:text-green-500 transition-colors">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  {/* Expand chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {/* Meeting toggle */}
                  <MeetingToggle active={b.include_in_meeting} onClick={(e) => { e.stopPropagation(); toggleMeeting(b.id); }} />
                  {/* Title */}
                  <span className="text-sm font-semibold text-gray-900 truncate min-w-0">{b.title}</span>
                  {/* Spacer */}
                  <div className="flex-1" />
                  {/* Metadata — dynamic columns */}
                  {visibleCols.map((col) => (
                    <Fragment key={col}>{renderColumnCell(b, col)}</Fragment>
                  ))}
                  {intakeSourceMap[b.id] && (
                    <a
                      href={`/intake/${intakeSourceMap[b.id]}/review`}
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
                <div className="bg-red-50/30 px-4 py-3 border-b border-gray-200">
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Title</span>
                      <InlineText value={b.title} onSave={(v) => saveField(b.id, "title", v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Impact</span>
                        <InlineText value={b.impact_description || ""} onSave={(v) => saveField(b.id, "impact_description", v)} multiline placeholder="Add impact..." />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                        <InlineText value={b.description || ""} onSave={(v) => saveField(b.id, "description", v)} multiline placeholder="Add description..." />
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                        <select
                          value={b.priority}
                          onChange={(e) => saveField(b.id, "priority", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          {blockerPriorityOptions.map((p) => (
                            <option key={p} value={p}>{priorityLabel(p)}</option>
                          ))}
                        </select>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                        <select
                          value={b.status}
                          onChange={(e) => saveField(b.id, "status", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          {blockerStatusOptions.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                        <div className="mt-0.5">
                          <OwnerPicker
                            value={b.owner_id || ""}
                            onChange={(id) => saveField(b.id, "owner_id", id)}
                            people={people}
                            onPersonAdded={onPersonAdded}
                          />
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                        <select
                          value={b.vendor_id || ""}
                          onChange={(e) => saveField(b.id, "vendor_id", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">None</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Due Date</span>
                        <InlineDate value={b.due_date} onSave={(v) => saveField(b.id, "due_date", v)} />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">First Flagged</span>
                        <p className="text-gray-900 mt-0.5">{new Date(b.first_flagged_at).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Age</span>
                        <p className="text-red-700 font-medium mt-0.5">{b.age_days != null ? formatAge(b.age_days) : "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Escalations</span>
                        <p className="text-gray-900 mt-0.5">{b.escalation_count > 0 ? `${b.escalation_count}x` : "None"}</p>
                      </div>
                    </div>
                    {/* Call Notes panel */}
                    {callNotesId === b.id && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Call Notes</label>
                        <textarea
                          value={callNotes}
                          onChange={(e) => setCallNotes(e.target.value)}
                          placeholder="Take notes during the call — AI will update fields automatically..."
                          rows={4}
                          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setCallNotesId(null); setCallNotes(""); }}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); saveCallNotes(b.id); }}
                            disabled={savingNotes || !callNotes.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {savingNotes && (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            )}
                            {savingNotes ? "Updating..." : "Process Notes"}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-300 mt-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCallNotesId(callNotesId === b.id ? null : b.id); setCallNotes(""); }}
                        className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${callNotesId === b.id ? "text-blue-700 border-blue-300 bg-blue-50" : "text-gray-500 border-gray-300 hover:text-blue-600 hover:border-blue-300"}`}
                        title="Call Notes"
                      >
                        Call Notes
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(b.id); }}
                        className="text-gray-400 hover:text-green-600 transition-colors"
                        title="Resolve"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

const actionPriorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const actionStatusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];

type ActionRow = ActionItem & { owner: Person | null; vendor: Vendor | null };

type ActionColumnKey = "priority" | "status" | "owner" | "vendor" | "due_date" | "age" | "escalations" | "first_flagged";

const ACTION_COLUMNS: { key: ActionColumnKey; label: string; width: string }[] = [
  { key: "priority", label: "Priority", width: "w-[68px]" },
  { key: "status", label: "Status", width: "w-[88px]" },
  { key: "owner", label: "Owner", width: "w-[150px]" },
  { key: "vendor", label: "Vendor", width: "w-[100px]" },
  { key: "due_date", label: "Due Date", width: "w-[80px]" },
  { key: "age", label: "Age", width: "w-12" },
  { key: "escalations", label: "Escalations", width: "w-[72px]" },
  { key: "first_flagged", label: "Flagged", width: "w-[80px]" },
];

const DEFAULT_ACTION_COLS: ActionColumnKey[] = ["priority", "status", "owner", "due_date", "age"];
const ACTION_COL_STORAGE_KEY = "action-items-columns";

function loadActionColumns(): ActionColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_ACTION_COLS;
  try {
    const stored = localStorage.getItem(ACTION_COL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ActionColumnKey[];
      if (parsed.length > 0 && parsed.every((k) => ACTION_COLUMNS.some((c) => c.key === k))) return parsed;
    }
  } catch {}
  return DEFAULT_ACTION_COLS;
}

function ActionItemsPanel({
  actions: initialActions,
  people,
  vendors,
  onPersonAdded,
  addUndo,
  onCountChange,
  intakeSourceMap = {},
  onNewItemsSuggested,
}: {
  actions: ActionRow[];
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
  intakeSourceMap?: Record<string, string>;
  onNewItemsSuggested?: (items: { title: string; suggested_type?: string; priority?: string; description?: string }[]) => void;
}) {
  const [actions, setActions] = useState<ActionRow[]>(initialActions);

  useEffect(() => { onCountChange?.(actions.length); }, [actions.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [callNotesId, setCallNotesId] = useState<string | null>(null);
  const [callNotes, setCallNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [visibleCols, setVisibleCols] = useState<ActionColumnKey[]>(loadActionColumns);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setShowColPicker(false);
    }
    if (showColPicker) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColPicker]);

  function toggleColumn(key: ActionColumnKey) {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(ACTION_COL_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function renderColumnCell(a: ActionRow, col: ActionColumnKey) {
    const badge = statusBadge(a.status);
    switch (col) {
      case "priority":
        return (
          <div className="w-[68px] flex-shrink-0 flex justify-end">
            <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(a.priority)}`}>{priorityLabel(a.priority)}</span>
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
            {a.owner ? (
              <div className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                  {a.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </span>
                <span className="text-xs text-gray-600 truncate">{a.owner.full_name}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 italic">Unassigned</span>
            )}
          </div>
        );
      case "vendor":
        return (
          <div className="w-[100px] flex-shrink-0 text-right">
            <span className="text-xs text-gray-600 truncate block">{a.vendor?.name || "—"}</span>
          </div>
        );
      case "due_date":
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[80px] text-right">{formatDateShort(a.due_date)}</span>;
      case "age":
        return <span className="text-xs text-gray-500 font-medium flex-shrink-0 w-12 text-right">{a.age_days != null ? formatAge(a.age_days) : ""}</span>;
      case "escalations":
        return <span className="text-xs text-gray-600 flex-shrink-0 w-[72px] text-right">{a.escalation_count > 0 ? `${a.escalation_count}x` : "None"}</span>;
      case "first_flagged":
        return <span className="text-xs text-gray-500 flex-shrink-0 w-[80px] text-right">{new Date(a.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
    }
  }

  function saveField(id: string, field: string, value: string) {
    const dbUpdates: Record<string, unknown> = {};

    if (field === "owner_id") {
      const newOwner = people.find((p) => p.id === value) || null;
      dbUpdates.owner_id = value || null;
      setActions((prev) => prev.map((a) => a.id === id ? { ...a, owner_id: value || null, owner: newOwner } as ActionRow : a));
    } else if (field === "vendor_id") {
      const newVendor = vendors.find((v) => v.id === value) || null;
      dbUpdates.vendor_id = value || null;
      setActions((prev) => prev.map((a) => a.id === id ? { ...a, vendor_id: value || null, vendor: newVendor } as ActionRow : a));
    } else {
      dbUpdates[field] = value || null;
      setActions((prev) => prev.map((a) => a.id === id ? { ...a, [field]: value || null } as ActionRow : a));
    }

    supabase.from("action_items").update(dbUpdates).eq("id", id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
  }

  async function saveCallNotes(id: string) {
    const entry = actions.find((a) => a.id === id);
    if (!entry || !callNotes.trim()) return;

    setSavingNotes(true);
    try {
      const res = await fetch("/api/agenda-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "action_item",
          current: {
            title: entry.title,
            description: entry.description,
            notes: entry.notes,
            priority: entry.priority,
            status: entry.status,
            due_date: entry.due_date,
          },
          notes: callNotes,
        }),
      });
      if (res.ok) {
        const { updates: aiUpdates, new_items } = await res.json();
        const merged: Record<string, unknown> = {};
        if (aiUpdates.title) merged.title = aiUpdates.title;
        if (aiUpdates.priority) merged.priority = aiUpdates.priority;
        if (aiUpdates.status) merged.status = aiUpdates.status;
        if (aiUpdates.description !== undefined) merged.description = aiUpdates.description;
        if (aiUpdates.notes !== undefined) merged.notes = aiUpdates.notes;
        if (aiUpdates.due_date !== undefined) merged.due_date = aiUpdates.due_date;
        setActions((prev) => prev.map((a) => a.id === id ? { ...a, ...merged } as ActionRow : a));
        setCallNotes("");
        setCallNotesId(null);
        supabase.from("action_items").update(merged).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
        if (new_items?.length > 0 && onNewItemsSuggested) {
          onNewItemsSuggested(new_items);
        }
      }
    } catch (err) {
      console.error("AI save failed:", err);
    } finally {
      setSavingNotes(false);
    }
  }

  function toggleMeeting(id: string) {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    const newVal = !action.include_in_meeting;
    setActions((prev) => prev.map((a) => a.id === id ? { ...a, include_in_meeting: newVal } : a));
    supabase.from("action_items").update({ include_in_meeting: newVal }).eq("id", id).then(({ error }) => {
      if (error) console.error("Toggle failed:", error);
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleResolve(id: string) {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    const prevStatus = action.status;
    const now = new Date().toISOString();
    const { error } = await supabase.from("action_items").update({ status: "complete", resolved_at: now }).eq("id", id);
    if (!error) {
      setActions((prev) => prev.filter((a) => a.id !== id));
      if (expandedId === id) setExpandedId(null);
      addUndo(`Resolved "${action.title}"`, async () => {
        const { error: err } = await supabase.from("action_items").update({ status: prevStatus, resolved_at: null }).eq("id", id);
        if (!err) setActions((prev) => [...prev, { ...action, status: prevStatus, resolved_at: null }]);
      });
    }
  }

  async function handleDelete(id: string) {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    const { error } = await supabase.from("action_items").delete().eq("id", id);
    if (!error) {
      setActions((prev) => prev.filter((a) => a.id !== id));
      if (expandedId === id) setExpandedId(null);
      const { owner: _o, vendor: _v, age_days: _a, days_overdue: _d, urgency: _u, ...dbFields } = action;
      addUndo(`Deleted "${action.title}"`, async () => {
        const { error: err } = await supabase.from("action_items").insert(dbFields);
        if (!err) setActions((prev) => [...prev, action]);
      });
    }
  }

  if (actions.length === 0) {
    return <p className="text-sm text-gray-500">No action items.</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Action Items ({actions.length})</h2>
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
              {ACTION_COLUMNS.map((col) => (
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
      </div>
      <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
        <div className="flex items-center gap-4">
          <div className="flex-1" />
          {ACTION_COLUMNS.filter((c) => visibleCols.includes(c.key)).map((col) => (
            <span key={col.key} className={`text-[10px] font-medium text-gray-400 uppercase tracking-wide ${col.width} text-right`}>
              {col.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        {actions.map((a) => {
          const isExpanded = expandedId === a.id;
          const badge = statusBadge(a.status);

          return (
            <Fragment key={a.id}>
              {/* Collapsed row */}
              <div
                className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(a.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Complete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleResolve(a.id); }}
                    className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center flex-shrink-0 transition-colors group/check"
                    title="Complete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-transparent group-hover/check:text-green-500 transition-colors">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  {/* Expand chevron */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {/* Meeting toggle */}
                  <MeetingToggle active={a.include_in_meeting} onClick={(e) => { e.stopPropagation(); toggleMeeting(a.id); }} />
                  {/* Title */}
                  <span className="text-sm font-semibold text-gray-900 truncate min-w-0">{a.title}</span>
                  {/* Spacer */}
                  <div className="flex-1" />
                  {/* Metadata — dynamic columns */}
                  {visibleCols.map((col) => (
                    <Fragment key={col}>{renderColumnCell(a, col)}</Fragment>
                  ))}
                  {intakeSourceMap[a.id] && (
                    <a
                      href={`/intake/${intakeSourceMap[a.id]}/review`}
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
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Title</span>
                      <InlineText value={a.title} onSave={(v) => saveField(a.id, "title", v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                        <InlineText value={a.description || ""} onSave={(v) => saveField(a.id, "description", v)} multiline placeholder="Add description..." />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
                        <InlineText value={a.notes || ""} onSave={(v) => saveField(a.id, "notes", v)} multiline placeholder="Add notes..." />
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                        <select
                          value={a.priority}
                          onChange={(e) => saveField(a.id, "priority", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          {actionPriorityOptions.map((p) => (
                            <option key={p} value={p}>{priorityLabel(p)}</option>
                          ))}
                        </select>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                        <select
                          value={a.status}
                          onChange={(e) => saveField(a.id, "status", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          {actionStatusOptions.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                        <div className="mt-0.5">
                          <OwnerPicker
                            value={a.owner_id || ""}
                            onChange={(id) => saveField(a.id, "owner_id", id)}
                            people={people}
                            onPersonAdded={onPersonAdded}
                          />
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                        <select
                          value={a.vendor_id || ""}
                          onChange={(e) => saveField(a.id, "vendor_id", e.target.value)}
                          className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">None</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Due Date</span>
                        <InlineDate value={a.due_date} onSave={(v) => saveField(a.id, "due_date", v)} />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">First Flagged</span>
                        <p className="text-gray-900 mt-0.5">{new Date(a.first_flagged_at).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Age</span>
                        <p className="text-gray-600 font-medium mt-0.5">{a.age_days != null ? formatAge(a.age_days) : "—"}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase">Escalations</span>
                        <p className="text-gray-900 mt-0.5">{a.escalation_count > 0 ? `${a.escalation_count}x` : "None"}</p>
                      </div>
                    </div>
                    {/* Call Notes panel */}
                    {callNotesId === a.id && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Call Notes</label>
                        <textarea
                          value={callNotes}
                          onChange={(e) => setCallNotes(e.target.value)}
                          placeholder="Take notes during the call — AI will update fields automatically..."
                          rows={4}
                          className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setCallNotesId(null); setCallNotes(""); }}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); saveCallNotes(a.id); }}
                            disabled={savingNotes || !callNotes.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {savingNotes && (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                            )}
                            {savingNotes ? "Updating..." : "Process Notes"}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-300 mt-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setCallNotesId(callNotesId === a.id ? null : a.id); setCallNotes(""); }}
                        className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${callNotesId === a.id ? "text-blue-700 border-blue-300 bg-blue-50" : "text-gray-500 border-gray-300 hover:text-blue-600 hover:border-blue-300"}`}
                        title="Call Notes"
                      >
                        Call Notes
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResolve(a.id); }}
                        className="text-gray-400 hover:text-green-600 transition-colors"
                        title="Resolve"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Intake Panel ─── */

const SOURCE_LABELS: Record<IntakeSource, string> = {
  slack: "Slack",
  email: "Email",
  meeting_notes: "Meeting Notes",
  fathom_transcript: "Fathom",
  manual: "Manual",
  spreadsheet: "Spreadsheet",
};

const SOURCE_COLORS: Record<IntakeSource, string> = {
  slack: "bg-purple-100 text-purple-700",
  email: "bg-blue-100 text-blue-700",
  meeting_notes: "bg-green-100 text-green-700",
  fathom_transcript: "bg-yellow-100 text-yellow-700",
  manual: "bg-gray-100 text-gray-600",
  spreadsheet: "bg-orange-100 text-orange-700",
};

const EXTRACTION_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
  complete: { label: "Extracted", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
};

const intakeSourceOptions: { value: IntakeSource; label: string }[] = [
  { value: "slack", label: "Slack Message" },
  { value: "email", label: "Email" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "fathom_transcript", label: "Fathom Transcript" },
  { value: "manual", label: "Manual Entry" },
];

function IntakePanel({
  project,
  initialIntakes,
  vendors,
  onCountChange,
}: {
  project: Project;
  initialIntakes: Intake[];
  vendors: Vendor[];
  onCountChange?: (count: number) => void;
}) {
  interface PastedImage { id: string; dataUrl: string; file: File; }

  const [intakes, setIntakes] = useState<Intake[]>(initialIntakes);
  const [showForm, setShowForm] = useState(false);
  const [rawText, setRawText] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [source, setSource] = useState<IntakeSource>("manual");
  const [vendorId, setVendorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => { onCountChange?.(intakes.length); }, [intakes.length, onCountChange]);

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPastedImages((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, file }]);
    };
    reader.readAsDataURL(file);
  }, []);

  function onTextareaPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.items) {
      for (let i = 0; i < cd.items.length; i++) {
        if (cd.items[i].type.startsWith("image/")) {
          e.preventDefault();
          const file = cd.items[i].getAsFile();
          if (file) addImageFile(file);
          return;
        }
      }
    }
    if (cd.files && cd.files.length > 0) {
      for (let i = 0; i < cd.files.length; i++) {
        if (cd.files[i].type.startsWith("image/")) {
          e.preventDefault();
          addImageFile(cd.files[i]);
          return;
        }
      }
    }
  }

  async function ocrImages(images: PastedImage[]): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const texts: string[] = [];
    for (let i = 0; i < images.length; i++) {
      setProgressStep(`Reading image ${i + 1} of ${images.length}...`);
      const { data } = await worker.recognize(images[i].dataUrl);
      if (data.text.trim()) texts.push(data.text.trim());
    }
    await worker.terminate();
    return texts.join("\n\n");
  }

  const hasContent = rawText.trim().length > 0 || pastedImages.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasContent) return;

    setLoading(true);
    setError(null);
    setProgressStep("");

    try {
      let combinedText = rawText.trim();
      if (pastedImages.length > 0) {
        setProgressStep("Running OCR on images...");
        const ocrText = await ocrImages(pastedImages);
        if (ocrText) {
          combinedText = combinedText
            ? `${combinedText}\n\n--- Text from pasted image ---\n${ocrText}`
            : ocrText;
        } else if (!combinedText) {
          throw new Error("Could not extract any text from the pasted images.");
        }
      }

      setProgressStep("Extracting items...");

      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.user?.id)
        .single();

      const { data: intake, error: insertError } = await supabase
        .from("intakes")
        .insert({
          raw_text: combinedText,
          source,
          vendor_id: vendorId || null,
          project_id: project.id,
          submitted_by: user.user?.id || null,
          org_id: profile?.org_id,
          extraction_status: "processing",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_id: intake.id,
          raw_text: combinedText,
          vendor_id: vendorId || null,
          project_id: project.id,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Extraction failed");
      }

      const updatedIntake = { ...intake, extraction_status: "complete" } as Intake;
      setIntakes((prev) => [updatedIntake, ...prev]);
      setRawText("");
      setPastedImages([]);
      setSource("manual");
      setVendorId("");
      setShowForm(false);

      router.push(`/intake/${intake.id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setProgressStep("");
    }
  }

  return (
    <div className="space-y-4">
      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-300 p-4 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as IntakeSource)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {intakeSourceOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vendor (optional)</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Any / Auto-detect</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500">Raw Text</label>
              <label className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Add Image
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) { for (let i = 0; i < files.length; i++) addImageFile(files[i]); }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onPaste={onTextareaPaste}
              rows={6}
              required={pastedImages.length === 0}
              placeholder="Paste Slack message, email, meeting notes, or any text here. You can also paste screenshots (Cmd+V)."
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {pastedImages.length > 0 && (
              <div className="mt-2 space-y-2">
                {pastedImages.map((img) => (
                  <div key={img.id} className="relative inline-block border border-gray-200 rounded-lg overflow-hidden">
                    <img src={img.dataUrl} alt="Pasted screenshot" className="max-w-full max-h-48 object-contain" />
                    <button
                      type="button"
                      onClick={() => setPastedImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-full p-0.5 shadow transition-colors"
                      title="Remove image"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-0.5">
                      Screenshot — will be OCR&apos;d on extract
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); setPastedImages([]); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              disabled={loading || !hasContent}
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {loading ? (progressStep || "Extracting...") : pastedImages.length > 0 ? `Extract (${pastedImages.length} image${pastedImages.length > 1 ? "s" : ""} will be OCR'd)` : "Extract"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          + New Intake
        </button>
      )}

      {intakes.length === 0 && !showForm ? (
        <p className="text-sm text-gray-500">No intakes for this project yet.</p>
      ) : intakes.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          <div className="bg-gray-800 px-4 py-2.5">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Past Intakes ({intakes.length})</h2>
          </div>
          <div>
            {intakes.map((intake) => {
              const isExpanded = expandedId === intake.id;
              const statusInfo = EXTRACTION_STATUS_LABELS[intake.extraction_status] || EXTRACTION_STATUS_LABELS.pending;
              const preview = intake.raw_text.split("\n")[0].slice(0, 120);

              return (
                <Fragment key={intake.id}>
                  <div
                    className="bg-white p-3 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : intake.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${SOURCE_COLORS[intake.source]}`}>
                        {SOURCE_LABELS[intake.source]}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(intake.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 font-semibold mt-1 ml-5 truncate">
                      {preview || "(empty)"}
                    </p>
                  </div>

                  {isExpanded && (
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Raw Text</span>
                          <pre className="text-sm text-gray-900 mt-1 whitespace-pre-wrap font-mono bg-white rounded border border-gray-200 p-2 max-h-48 overflow-y-auto">
                            {intake.raw_text}
                          </pre>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Source</span>
                            <p className="text-gray-900 mt-0.5">{SOURCE_LABELS[intake.source]}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                            <p className="text-gray-900 mt-0.5">{statusInfo.label}</p>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Submitted</span>
                            <p className="text-gray-900 mt-0.5">{new Date(intake.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        {intake.extraction_status === "complete" && (
                          <div className="flex justify-end pt-2 border-t border-gray-300 mt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/intake/${intake.id}/review`); }}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50"
                            >
                              Review Extracted Items
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const searchParams = useSearchParams();
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

      {/* Tab content */}
      <div className="mt-6">
        {active === "agenda" && (
          <AgendaView project={project} initialItems={agendaRows} onCountChange={setAgendaCount} />
        )}

        {active === "blockers" && (
          <BlockersPanel blockers={blockers} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setBlockerCount} intakeSourceMap={intakeSourceMap} />
        )}

        {active === "raid" && (
          <RaidLog initialEntries={raidEntries} project={project} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setRaidCount} intakeSourceMap={intakeSourceMap} />
        )}

        {active === "actions" && (
          <ActionItemsPanel actions={actions} people={peopleList} vendors={vendors} onPersonAdded={addPerson} addUndo={addUndo} onCountChange={setActionCount} intakeSourceMap={intakeSourceMap} />
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

interface BlockerEditForm {
  title: string;
  priority: PriorityLevel;
  status: ItemStatus;
  owner_id: string;
  vendor_id: string;
  impact_description: string;
  description: string;
  due_date: string;
}

type BlockerRow = Blocker & { owner: Person | null; vendor: Vendor | null };

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

function BlockersPanel({
  blockers: initialBlockers,
  people,
  vendors,
  onPersonAdded,
  addUndo,
  onCountChange,
  intakeSourceMap = {},
}: {
  blockers: BlockerRow[];
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
  intakeSourceMap?: Record<string, string>;
}) {
  const [blockers, setBlockers] = useState<BlockerRow[]>(initialBlockers);

  useEffect(() => { onCountChange?.(blockers.length); }, [blockers.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BlockerEditForm>({
    title: "", priority: "high", status: "pending",
    owner_id: "", vendor_id: "", impact_description: "", description: "", due_date: "",
  });
  const [callNotes, setCallNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const supabase = createClient();

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
    if (editingId && editingId !== id) setEditingId(null);
  }

  function startEdit(b: BlockerRow) {
    setEditingId(b.id);
    setEditForm({
      title: b.title,
      priority: b.priority,
      status: b.status,
      owner_id: b.owner_id || "",
      vendor_id: b.vendor_id || "",
      impact_description: b.impact_description || "",
      description: b.description || "",
      due_date: b.due_date || "",
    });
    setCallNotes("");
  }

  async function saveEdit(id: string) {
    const newOwner = people.find((p) => p.id === editForm.owner_id) || null;
    const newVendor = vendors.find((v) => v.id === editForm.vendor_id) || null;

    // If call notes present, process through AI (can't be optimistic — need AI response)
    if (callNotes.trim()) {
      setSavingNotes(true);
      try {
        const res = await fetch("/api/agenda-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "blocker",
            current: {
              title: editForm.title,
              impact_description: editForm.impact_description,
              description: editForm.description,
              priority: editForm.priority,
              status: editForm.status,
            },
            notes: callNotes,
          }),
        });
        if (res.ok) {
          const { updates: aiUpdates } = await res.json();
          const merged = {
            title: aiUpdates.title || editForm.title,
            priority: aiUpdates.priority || editForm.priority,
            status: aiUpdates.status || editForm.status,
            owner_id: editForm.owner_id || null,
            vendor_id: editForm.vendor_id || null,
            impact_description: aiUpdates.impact_description !== undefined ? aiUpdates.impact_description : editForm.impact_description || null,
            description: aiUpdates.description !== undefined ? aiUpdates.description : editForm.description || null,
            due_date: editForm.due_date || null,
          };
          setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, ...merged, owner: newOwner, vendor: newVendor } as BlockerRow : b));
          setCallNotes("");
          setEditingId(null);
          setSavingNotes(false);
          // Fire DB save in background
          supabase.from("blockers").update(merged).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
        }
      } catch (err) {
        console.error("AI save failed:", err);
        setSavingNotes(false);
      }
      return;
    }

    // No notes — optimistic: update UI immediately, save in background
    const updates = {
      title: editForm.title,
      priority: editForm.priority,
      status: editForm.status,
      owner_id: editForm.owner_id || null,
      vendor_id: editForm.vendor_id || null,
      impact_description: editForm.impact_description || null,
      description: editForm.description || null,
      due_date: editForm.due_date || null,
    };

    setBlockers((prev) => prev.map((b) => b.id === id ? { ...b, ...updates, owner: newOwner, vendor: newVendor } as BlockerRow : b));
    setEditingId(null);

    supabase.from("blockers").update(updates).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
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
      <div className="bg-red-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers ({blockers.length})</h2>
      </div>
      <div>
        {blockers.map((b) => {
          const isExpanded = expandedId === b.id;
          const isEditing = editingId === b.id;
          const badge = statusBadge(b.status);

          return (
            <Fragment key={b.id}>
              {/* Collapsed row */}
              <div
                className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-red-50/40"
                onClick={() => toggleExpand(b.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
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
                  {/* Metadata */}
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border flex-shrink-0 ${priorityColor(b.priority)}`}>{priorityLabel(b.priority)}</span>
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${badge.className}`}>{badge.label}</span>
                  {b.owner ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center">
                        {b.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-xs text-gray-600 max-w-[100px] truncate">{b.owner.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic flex-shrink-0">Unassigned</span>
                  )}
                  {b.age_days != null && (
                    <span className="text-xs text-red-600 font-medium flex-shrink-0 w-12 text-right">{formatAge(b.age_days)}</span>
                  )}
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

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-red-50/30 px-4 py-3 border-b border-gray-200">
                  {isEditing ? (
                    <div>
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3 min-w-0">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                              <select
                                value={editForm.priority}
                                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as PriorityLevel })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {blockerPriorityOptions.map((p) => (
                                  <option key={p} value={p}>{priorityLabel(p)}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                              <select
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ItemStatus })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {blockerStatusOptions.map((s) => (
                                  <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
                              <OwnerPicker
                                value={editForm.owner_id}
                                onChange={(id) => setEditForm({ ...editForm, owner_id: id })}
                                people={people}
                                onPersonAdded={onPersonAdded}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Vendor</label>
                              <select
                                value={editForm.vendor_id}
                                onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">None</option>
                                {vendors.map((v) => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                            <input
                              type="date"
                              value={editForm.due_date}
                              onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                              className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Impact</label>
                            <textarea
                              value={editForm.impact_description}
                              onChange={(e) => setEditForm({ ...editForm, impact_description: e.target.value })}
                              rows={2}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={2}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                            />
                          </div>
                        </div>
                        <div className="w-72 flex-shrink-0 space-y-1.5">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Call Notes</label>
                          <textarea
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            placeholder="Take notes during the call..."
                            rows={12}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResolve(b.id); }}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(b.id); }}
                          disabled={savingNotes}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {savingNotes && (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                          )}
                          {savingNotes ? "Updating..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Impact</span>
                          <p className="text-gray-900 mt-0.5">{b.impact_description || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                          <p className="text-gray-900 mt-0.5">{b.description || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                          <p className="text-gray-900 mt-0.5">{b.owner?.full_name || "Unassigned"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                          <p className="text-gray-900 mt-0.5">{b.vendor?.name || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                          <p className="text-gray-900 mt-0.5">{b.status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                          <p className="text-gray-900 mt-0.5">{priorityLabel(b.priority)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Due Date</span>
                          <p className="text-gray-900 mt-0.5">{b.due_date ? formatDateShort(b.due_date) : "—"}</p>
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
                      <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-300 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(b); }}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
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
                  )}
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

interface ActionEditForm {
  title: string;
  description: string;
  notes: string;
  priority: PriorityLevel;
  status: ItemStatus;
  owner_id: string;
  vendor_id: string;
  due_date: string;
}

type ActionRow = ActionItem & { owner: Person | null; vendor: Vendor | null };

function ActionItemsPanel({
  actions: initialActions,
  people,
  vendors,
  onPersonAdded,
  addUndo,
  onCountChange,
  intakeSourceMap = {},
}: {
  actions: ActionRow[];
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
  intakeSourceMap?: Record<string, string>;
}) {
  const [actions, setActions] = useState<ActionRow[]>(initialActions);

  useEffect(() => { onCountChange?.(actions.length); }, [actions.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ActionEditForm>({
    title: "", description: "", notes: "", priority: "medium", status: "pending",
    owner_id: "", vendor_id: "", due_date: "",
  });
  const [callNotes, setCallNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const supabase = createClient();

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
    if (editingId && editingId !== id) setEditingId(null);
  }

  function startEdit(a: ActionRow) {
    setEditingId(a.id);
    setEditForm({
      title: a.title,
      description: a.description || "",
      notes: a.notes || "",
      priority: a.priority,
      status: a.status,
      owner_id: a.owner_id || "",
      vendor_id: a.vendor_id || "",
      due_date: a.due_date || "",
    });
    setCallNotes("");
  }

  async function saveEdit(id: string) {
    const newOwner = people.find((p) => p.id === editForm.owner_id) || null;
    const newVendor = vendors.find((v) => v.id === editForm.vendor_id) || null;

    // If call notes present, process through AI (can't be optimistic — need AI response)
    if (callNotes.trim()) {
      setSavingNotes(true);
      try {
        const res = await fetch("/api/agenda-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "action_item",
            current: {
              title: editForm.title,
              description: editForm.description,
              notes: editForm.notes,
              priority: editForm.priority,
              status: editForm.status,
            },
            notes: callNotes,
          }),
        });
        if (res.ok) {
          const { updates: aiUpdates } = await res.json();
          const merged = {
            title: aiUpdates.title || editForm.title,
            priority: aiUpdates.priority || editForm.priority,
            status: aiUpdates.status || editForm.status,
            owner_id: editForm.owner_id || null,
            vendor_id: editForm.vendor_id || null,
            description: aiUpdates.description !== undefined ? aiUpdates.description : editForm.description || null,
            notes: aiUpdates.notes !== undefined ? aiUpdates.notes : editForm.notes || null,
            due_date: editForm.due_date || null,
          };
          setActions((prev) => prev.map((a) => a.id === id ? { ...a, ...merged, owner: newOwner, vendor: newVendor } as ActionRow : a));
          setCallNotes("");
          setEditingId(null);
          setSavingNotes(false);
          supabase.from("action_items").update(merged).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
        }
      } catch (err) {
        console.error("AI save failed:", err);
        setSavingNotes(false);
      }
      return;
    }

    // No notes — optimistic: update UI immediately, save in background
    const updates = {
      title: editForm.title,
      description: editForm.description || null,
      notes: editForm.notes || null,
      priority: editForm.priority,
      status: editForm.status,
      owner_id: editForm.owner_id || null,
      vendor_id: editForm.vendor_id || null,
      due_date: editForm.due_date || null,
    };

    setActions((prev) => prev.map((a) => a.id === id ? { ...a, ...updates, owner: newOwner, vendor: newVendor } as ActionRow : a));
    setEditingId(null);

    supabase.from("action_items").update(updates).eq("id", id).then(({ error }) => { if (error) console.error("Save failed:", error); });
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
      <div className="bg-gray-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Action Items ({actions.length})</h2>
      </div>
      <div>
        {actions.map((a) => {
          const isExpanded = expandedId === a.id;
          const isEditing = editingId === a.id;
          const badge = statusBadge(a.status);

          return (
            <Fragment key={a.id}>
              {/* Collapsed row */}
              <div
                className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(a.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
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
                  {/* Metadata */}
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border flex-shrink-0 ${priorityColor(a.priority)}`}>{priorityLabel(a.priority)}</span>
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${badge.className}`}>{badge.label}</span>
                  {a.owner ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center">
                        {a.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-xs text-gray-600 max-w-[100px] truncate">{a.owner.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic flex-shrink-0">Unassigned</span>
                  )}
                  {a.age_days != null && (
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0 w-12 text-right">{formatAge(a.age_days)}</span>
                  )}
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

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  {isEditing ? (
                    <div>
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-3 min-w-0">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                              <select
                                value={editForm.priority}
                                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as PriorityLevel })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {actionPriorityOptions.map((p) => (
                                  <option key={p} value={p}>{priorityLabel(p)}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                              <select
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ItemStatus })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {actionStatusOptions.map((s) => (
                                  <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
                              <OwnerPicker
                                value={editForm.owner_id}
                                onChange={(id) => setEditForm({ ...editForm, owner_id: id })}
                                people={people}
                                onPersonAdded={onPersonAdded}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Vendor</label>
                              <select
                                value={editForm.vendor_id}
                                onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">None</option>
                                {vendors.map((v) => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
                            <input
                              type="date"
                              value={editForm.due_date}
                              onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                              className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={2}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                            <textarea
                              value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              rows={2}
                              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                            />
                          </div>
                        </div>
                        <div className="w-72 flex-shrink-0 space-y-1.5">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Call Notes</label>
                          <textarea
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            placeholder="Take notes during the call..."
                            rows={14}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <div className="flex-1" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleResolve(a.id); }}
                          className="px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(a.id); }}
                          disabled={savingNotes}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {savingNotes && (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                          )}
                          {savingNotes ? "Updating..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                          <p className="text-gray-900 mt-0.5">{a.description || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
                          <p className="text-gray-900 mt-0.5">{a.notes || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                          <p className="text-gray-900 mt-0.5">{a.owner?.full_name || "Unassigned"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                          <p className="text-gray-900 mt-0.5">{a.vendor?.name || "—"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                          <p className="text-gray-900 mt-0.5">{a.status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                          <p className="text-gray-900 mt-0.5">{priorityLabel(a.priority)}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Due Date</span>
                          <p className="text-gray-900 mt-0.5">{a.due_date ? formatDateShort(a.due_date) : "—"}</p>
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
                      <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-300 mt-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(a); }}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
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
                  )}
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

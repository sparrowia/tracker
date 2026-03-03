"use client";

import { useState, useRef, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor, ProjectAgendaRow, PriorityLevel, ItemStatus } from "@/lib/types";
import RaidLog from "@/components/raid-log";
import { AgendaView } from "@/components/agenda-view";

type Tab = "actions" | "blockers" | "raid" | "agenda";

const TAB_LABELS: Record<Tab, string> = {
  actions: "Action Items",
  blockers: "Blockers",
  raid: "RAID Log",
  agenda: "Meeting Agenda",
};

const DEFAULT_ORDER: Tab[] = ["actions", "blockers", "raid", "agenda"];
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
}: {
  project: Project;
  blockers: (Blocker & { owner: Person | null; vendor: Vendor | null })[];
  actions: (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  raidEntries: (RaidEntry & { owner: Person | null; vendor: Vendor | null })[];
  people: Person[];
  vendors: Vendor[];
  agendaRows: ProjectAgendaRow[];
}) {
  const [tabOrder, setTabOrder] = useState<Tab[]>(loadTabOrder);
  const [active, setActive] = useState<Tab>(tabOrder[0]);
  const [dragTab, setDragTab] = useState<Tab | null>(null);
  const [dragOverTab, setDragOverTab] = useState<Tab | null>(null);
  const dragStartIndex = useRef<number>(-1);

  function countForTab(key: Tab) {
    switch (key) {
      case "agenda": return agendaRows.length;
      case "blockers": return blockers.length;
      case "raid": return raidEntries.length;
      case "actions": return actions.length;
    }
  }

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
          <AgendaView project={project} initialItems={agendaRows} />
        )}

        {active === "blockers" && (
          <BlockersPanel blockers={blockers} people={people} vendors={vendors} />
        )}

        {active === "raid" && (
          <RaidLog initialEntries={raidEntries} project={project} people={people} vendors={vendors} />
        )}

        {active === "actions" && (
          <ActionItemsPanel actions={actions} />
        )}
      </div>
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

function BlockersPanel({
  blockers: initialBlockers,
  people,
  vendors,
}: {
  blockers: BlockerRow[];
  people: Person[];
  vendors: Vendor[];
}) {
  const [blockers, setBlockers] = useState<BlockerRow[]>(initialBlockers);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<BlockerEditForm>({
    title: "", priority: "high", status: "pending",
    owner_id: "", vendor_id: "", impact_description: "", description: "", due_date: "",
  });
  const supabase = createClient();

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
  }

  async function saveEdit(id: string) {
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

    const { error } = await supabase.from("blockers").update(updates).eq("id", id);

    if (!error) {
      const newOwner = people.find((p) => p.id === editForm.owner_id) || null;
      const newVendor = vendors.find((v) => v.id === editForm.vendor_id) || null;
      setBlockers((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, ...updates, owner: newOwner, vendor: newVendor } as BlockerRow
            : b
        )
      );
      setEditingId(null);
    }
  }

  async function handleResolve(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("blockers").update({ status: "complete", resolved_at: now }).eq("id", id);
    if (!error) {
      setBlockers((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("blockers").delete().eq("id", id);
    if (!error) {
      setBlockers((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) setExpandedId(null);
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
                className="bg-white p-3 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-red-50/40"
                onClick={() => toggleExpand(b.id)}
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
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(b.priority)}`}>{b.priority}</span>
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${badge.className}`}>{badge.label}</span>
                  {b.age_days != null && (
                    <span className="text-xs text-red-600 font-medium">{formatAge(b.age_days)}</span>
                  )}
                </div>
                <p className="text-sm text-gray-900 font-semibold mt-1 ml-5">{b.title}</p>
                <div className="flex items-center gap-3 mt-1 ml-5 text-xs text-gray-500">
                  {b.owner ? (
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                        {b.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span>{b.owner.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                  {b.vendor && <span className="text-gray-400">| {b.vendor.name}</span>}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="bg-red-50/30 px-4 py-3 border-b border-gray-200">
                  {isEditing ? (
                    <div className="space-y-3 max-w-lg">
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
                              <option key={p} value={p}>{p}</option>
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
                              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
                          <select
                            value={editForm.owner_id}
                            onChange={(e) => setEditForm({ ...editForm, owner_id: e.target.value })}
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Unassigned</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>{p.full_name}</option>
                            ))}
                          </select>
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
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(b.id); }}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          Save
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
                          <p className="text-gray-900 mt-0.5">{b.status.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                          <p className="text-gray-900 mt-0.5">{b.priority}</p>
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

function ActionItemsPanel({
  actions,
}: {
  actions: (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
}) {
  if (actions.length === 0) {
    return <p className="text-sm text-gray-500">No action items.</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Action Items</h2>
      </div>
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-300">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((ai) => {
            const badge = statusBadge(ai.status);
            return (
              <tr key={ai.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{ai.title}</td>
                <td className="px-4 py-3 text-sm">
                  {ai.owner ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                        {ai.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-gray-700">{ai.owner.full_name}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(ai.priority)}`}>
                    {ai.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(ai.due_date)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{ai.age_days != null ? formatAge(ai.age_days) : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

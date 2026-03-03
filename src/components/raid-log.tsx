"use client";

import { useState, useEffect, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { RaidEntry, RaidType, PriorityLevel, ItemStatus, Person, Vendor, Project } from "@/lib/types";
import OwnerPicker from "@/components/owner-picker";

type RaidRow = RaidEntry & { owner: Person | null; vendor: Vendor | null };

interface RaidLogProps {
  initialEntries: RaidRow[];
  project: Project;
  people: Person[];
  vendors: Vendor[];
  onPersonAdded: (person: Person) => void;
  addUndo: (label: string, undo: () => Promise<void>) => void;
  onCountChange?: (count: number) => void;
}

const raidTypes: RaidType[] = ["risk", "assumption", "issue", "decision"];
const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const statusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];

const typePrefix: Record<RaidType, string> = { risk: "R", assumption: "A", issue: "I", decision: "D" };

interface EditFormState {
  title: string;
  raid_type: RaidType;
  priority: PriorityLevel;
  status: ItemStatus;
  owner_id: string;
  vendor_id: string;
  impact: string;
  description: string;
  decision_date: string;
}

function ageFromDate(date: string): number {
  const diff = Date.now() - new Date(date).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function RaidLog({ initialEntries, project, people, vendors, onPersonAdded, addUndo, onCountChange }: RaidLogProps) {
  const [entries, setEntries] = useState<RaidRow[]>(initialEntries);

  useEffect(() => { onCountChange?.(entries.length); }, [entries.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RaidType>("risk");
  const [editForm, setEditForm] = useState<EditFormState>({
    title: "", raid_type: "risk", priority: "medium", status: "pending",
    owner_id: "", vendor_id: "", impact: "", description: "", decision_date: "",
  });
  const supabase = createClient();

  const risks = entries.filter((r) => r.raid_type === "risk");
  const assumptions = entries.filter((r) => r.raid_type === "assumption");
  const issues = entries.filter((r) => r.raid_type === "issue");
  const decisions = entries.filter((r) => r.raid_type === "decision");

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    if (editingId && editingId !== id) setEditingId(null);
  }

  function startEdit(entry: RaidRow) {
    setEditingId(entry.id);
    setEditForm({
      title: entry.title,
      raid_type: entry.raid_type,
      priority: entry.priority,
      status: entry.status,
      owner_id: entry.owner_id || "",
      vendor_id: entry.vendor_id || "",
      impact: entry.impact || "",
      description: entry.description || "",
      decision_date: entry.decision_date || "",
    });
  }

  async function saveEdit(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;

    const typeChanged = entry.raid_type !== editForm.raid_type;
    let newDisplayId = entry.display_id;

    if (typeChanged) {
      const prefix = typePrefix[editForm.raid_type];
      const existingOfType = entries.filter((e) => e.raid_type === editForm.raid_type);
      const maxNum = existingOfType.reduce((max, e) => {
        const num = parseInt(e.display_id.slice(1));
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      newDisplayId = `${prefix}${maxNum + 1}`;
    }

    const updates: Record<string, unknown> = {
      title: editForm.title,
      raid_type: editForm.raid_type,
      display_id: newDisplayId,
      priority: editForm.priority,
      status: editForm.status,
      owner_id: editForm.owner_id || null,
      vendor_id: editForm.vendor_id || null,
      impact: editForm.impact || null,
      description: editForm.description || null,
      decision_date: editForm.raid_type === "decision" ? (editForm.decision_date || null) : null,
    };

    const { error } = await supabase.from("raid_entries").update(updates).eq("id", id);

    if (!error) {
      const newOwner = people.find((p) => p.id === editForm.owner_id) || null;
      const newVendor = vendors.find((v) => v.id === editForm.vendor_id) || null;
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                ...updates,
                display_id: newDisplayId,
                raid_type: editForm.raid_type,
                priority: editForm.priority as PriorityLevel,
                status: editForm.status as ItemStatus,
                owner_id: editForm.owner_id || null,
                vendor_id: editForm.vendor_id || null,
                owner: newOwner,
                vendor: newVendor,
              } as RaidRow
            : e
        )
      );
      setEditingId(null);
    }
  }

  async function handleResolve(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const prevStatus = entry.status;
    const now = new Date().toISOString();
    const { error } = await supabase.from("raid_entries").update({ status: "complete", resolved_at: now }).eq("id", id);
    if (!error) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (expandedId === id) setExpandedId(null);
      addUndo(`Resolved "${entry.title}"`, async () => {
        const { error: err } = await supabase.from("raid_entries").update({ status: prevStatus, resolved_at: null }).eq("id", id);
        if (!err) setEntries((prev) => [...prev, { ...entry, status: prevStatus, resolved_at: null }]);
      });
    }
  }

  async function handleDelete(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const { error } = await supabase.from("raid_entries").delete().eq("id", id);
    if (!error) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (expandedId === id) setExpandedId(null);
      const { owner: _o, vendor: _v, ...dbFields } = entry;
      addUndo(`Deleted "${entry.title}"`, async () => {
        const { error: err } = await supabase.from("raid_entries").insert(dbFields);
        if (!err) setEntries((prev) => [...prev, entry]);
      });
    }
  }

  function renderQuadrant(label: string, items: RaidRow[]) {
    return (
      <div className="rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-700 px-4 h-9 flex items-center">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">{label} ({items.length})</h3>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">None</p>
        ) : (
          <div>
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const isEditing = editingId === entry.id;
              const badge = statusBadge(entry.status);
              const age = ageFromDate(entry.first_flagged_at);

              return (
                <Fragment key={entry.id}>
                  {/* Collapsed row */}
                  <div
                    className="bg-white p-3 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpand(entry.id)}
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
                      <span className="text-xs font-mono text-gray-400">{entry.display_id}</span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(entry.priority)}`}>{priorityLabel(entry.priority)}</span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${badge.className}`}>{badge.label}</span>
                    </div>
                    <p className="text-sm text-gray-900 font-semibold mt-1 ml-5">{entry.title}</p>
                    <div className="flex items-center gap-3 mt-1 ml-5 text-xs text-gray-500">
                      {entry.owner ? (
                        <div className="flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-blue-100 text-[9px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                            {entry.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </span>
                          <span>{entry.owner.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                      <span>{formatAge(age)}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
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
                              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                              <select
                                value={editForm.raid_type}
                                onChange={(e) => setEditForm({ ...editForm, raid_type: e.target.value as RaidType })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {raidTypes.map((t) => (
                                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                              <select
                                value={editForm.priority}
                                onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as PriorityLevel })}
                                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                {priorityOptions.map((p) => (
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
                                {statusOptions.map((s) => (
                                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
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
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Impact</label>
                            <textarea
                              value={editForm.impact}
                              onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
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
                          {editForm.raid_type === "decision" && (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Decision Date</label>
                              <input
                                type="date"
                                value={editForm.decision_date}
                                onChange={(e) => setEditForm({ ...editForm, decision_date: e.target.value })}
                                className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); saveEdit(entry.id); }}
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
                              <p className="text-gray-900 mt-0.5">{entry.impact || "—"}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                              <p className="text-gray-900 mt-0.5">{entry.description || "—"}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                              <p className="text-gray-900 mt-0.5">{entry.owner?.full_name || "Unassigned"}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                              <p className="text-gray-900 mt-0.5">{entry.vendor?.name || "—"}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                              <p className="text-gray-900 mt-0.5">{entry.status.replace(/_/g, " ")}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                              <p className="text-gray-900 mt-0.5">{priorityLabel(entry.priority)}</p>
                            </div>
                            {entry.raid_type === "decision" && (
                              <div>
                                <span className="text-xs font-medium text-gray-500 uppercase">Decision Date</span>
                                <p className="text-gray-900 mt-0.5">{formatDateShort(entry.decision_date)}</p>
                              </div>
                            )}
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">First Flagged</span>
                              <p className="text-gray-900 mt-0.5">{new Date(entry.first_flagged_at).toLocaleDateString()}</p>
                            </div>
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Escalations</span>
                              <p className="text-gray-900 mt-0.5">{entry.escalation_count > 0 ? `${entry.escalation_count}x` : "None"}</p>
                            </div>
                            {entry.resolved_at && (
                              <div>
                                <span className="text-xs font-medium text-gray-500 uppercase">Resolved</span>
                                <p className="text-gray-900 mt-0.5">{formatDateShort(entry.resolved_at)}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-300 mt-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); startEdit(entry); }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                              className="text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResolve(entry.id); }}
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

  return (
    <div className="flex gap-[10px]">
      {/* Left sidebar tabs */}
      <div className="flex flex-col w-[140px] flex-shrink-0">
        {tabs.map((tab, i) => (
          <button
            key={tab.type}
            onClick={() => setActiveTab(tab.type)}
            className={`px-3 text-sm font-medium text-left border border-gray-300 transition-colors ${
              i > 0 ? "-mt-px" : ""
            } ${
              i === 0 ? "rounded-t-lg h-9 flex items-center" : "py-2.5"
            } ${
              i === tabs.length - 1 ? "rounded-b-lg" : ""
            } ${
              activeTab === tab.type
                ? "bg-gray-800 text-white border-gray-800 z-10 relative"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab.label} ({tab.items.length})
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex-1">
        {renderQuadrant(activeItems.label, activeItems.items)}
      </div>
    </div>
  );
}

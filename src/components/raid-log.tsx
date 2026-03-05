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
  intakeSourceMap?: Record<string, string>;
}

const raidTypes: RaidType[] = ["risk", "assumption", "issue", "decision"];
const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const statusOptions: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];
const riskStatusOptions: ItemStatus[] = ["identified", "assessing", "in_progress", "mitigated", "closed"];

const typePrefix: Record<RaidType, string> = { risk: "R", assumption: "A", issue: "I", decision: "D" };

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

export default function RaidLog({ initialEntries, project, people, vendors, onPersonAdded, addUndo, onCountChange, intakeSourceMap = {} }: RaidLogProps) {
  const [entries, setEntries] = useState<RaidRow[]>(initialEntries);

  useEffect(() => { onCountChange?.(entries.length); }, [entries.length, onCountChange]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RaidType>("risk");
  const [addingType, setAddingType] = useState<RaidType | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<PriorityLevel>("medium");
  const supabase = createClient();

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
    });
  }

  const risks = entries.filter((r) => r.raid_type === "risk");
  const assumptions = entries.filter((r) => r.raid_type === "assumption");
  const issues = entries.filter((r) => r.raid_type === "issue");
  const decisions = entries.filter((r) => r.raid_type === "decision");

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleResolve(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const prevStatus = entry.status;
    const now = new Date().toISOString();
    const resolveStatus = entry.raid_type === "risk" ? "closed" : "complete";
    const { error } = await supabase.from("raid_entries").update({ status: resolveStatus, resolved_at: now }).eq("id", id);
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

    const { data, error } = await supabase.from("raid_entries").insert(newEntry).select("*, owner:people(*), vendor:vendors(*)").single();
    if (!error && data) {
      setEntries((prev) => [data as RaidRow, ...prev]);
      setAddTitle("");
      setAddPriority("medium");
      setAddingType(null);
    }
  }

  function renderQuadrant(label: string, raidType: RaidType, items: RaidRow[]) {
    return (
      <div className="rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-700 px-4 h-9 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">{label} ({items.length})</h3>
          <button
            onClick={() => { setAddingType(addingType === raidType ? null : raidType); setAddTitle(""); setAddPriority("medium"); }}
            className="text-xs text-blue-300 hover:text-white transition-colors"
          >
            + Add {label.slice(0, -1)}
          </button>
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
        {items.length === 0 && addingType !== raidType ? (
          <p className="text-sm text-gray-400 p-4">None</p>
        ) : items.length === 0 ? null : (
          <div>
            <div className="bg-gray-50 px-3 py-1 border-b border-gray-300">
              <div className="flex items-center gap-2.5">
                <div className="flex-1" />
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[68px] text-right">Priority</span>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[88px] text-right">Status</span>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-[130px]">Owner</span>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide w-12 text-right">Age</span>
              </div>
            </div>
            {items.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const badge = statusBadge(entry.status);
              const age = ageFromDate(entry.first_flagged_at);

              return (
                <Fragment key={entry.id}>
                  {/* Collapsed row */}
                  <div
                    className="bg-white px-3 py-2 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
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
                      {/* Expand chevron */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
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
                      <span className="text-sm font-semibold text-gray-900 truncate min-w-0">{entry.title}</span>
                      {/* Spacer */}
                      <div className="flex-1" />
                      {/* Metadata — fixed-width columns */}
                      <div className="w-[68px] flex-shrink-0 flex justify-end">
                        <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(entry.priority)}`}>{priorityLabel(entry.priority)}</span>
                      </div>
                      <div className="w-[88px] flex-shrink-0 flex justify-end">
                        <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${badge.className}`}>{badge.label}</span>
                      </div>
                      <div className="w-[130px] flex-shrink-0">
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
                      <span className="text-xs text-gray-500 font-medium flex-shrink-0 w-12 text-right">{formatAge(age)}</span>
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
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Title</span>
                          <InlineText value={entry.title} onSave={(v) => saveField(entry.id, "title", v)} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Impact</span>
                            <InlineText value={entry.impact || ""} onSave={(v) => saveField(entry.id, "impact", v)} multiline placeholder="Add impact..." />
                          </div>
                          <div>
                            <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                            <InlineText value={entry.description || ""} onSave={(v) => saveField(entry.id, "description", v)} multiline placeholder="Add description..." />
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-gray-500 uppercase">Type</span>
                            <select
                              value={entry.raid_type}
                              onChange={(e) => saveField(entry.id, "raid_type", e.target.value)}
                              className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {raidTypes.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
                            <select
                              value={entry.priority}
                              onChange={(e) => saveField(entry.id, "priority", e.target.value)}
                              className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {priorityOptions.map((p) => (
                                <option key={p} value={p}>{priorityLabel(p)}</option>
                              ))}
                            </select>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                            <select
                              value={entry.status}
                              onChange={(e) => saveField(entry.id, "status", e.target.value)}
                              className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {(entry.raid_type === "risk" ? riskStatusOptions : statusOptions).map((s) => (
                                <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                              ))}
                            </select>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-gray-500 uppercase">Owner</span>
                            <div className="mt-0.5">
                              <OwnerPicker
                                value={entry.owner_id || ""}
                                onChange={(id) => saveField(entry.id, "owner_id", id)}
                                people={people}
                                onPersonAdded={onPersonAdded}
                              />
                            </div>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-gray-500 uppercase">Vendor</span>
                            <select
                              value={entry.vendor_id || ""}
                              onChange={(e) => saveField(entry.id, "vendor_id", e.target.value)}
                              className="block w-full text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0.5 mt-0.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              <option value="">None</option>
                              {vendors.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                          </div>
                          {entry.raid_type === "decision" && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 uppercase">Decision Date</span>
                              <InlineDate value={entry.decision_date} onSave={(v) => saveField(entry.id, "decision_date", v)} />
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
        {renderQuadrant(activeItems.label, activeItems.type as RaidType, activeItems.items)}
      </div>
    </div>
  );
}

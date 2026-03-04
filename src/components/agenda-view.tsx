"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { priorityColor, priorityDot, formatAge } from "@/lib/utils";
import type { Project, ProjectAgendaRow, PriorityLevel } from "@/lib/types";

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
};

type SortField = "name" | "priority" | "type" | "responsible" | "age" | "score";
type SortDirection = "asc" | "desc";

const priorityRankMap: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sortItems(items: ProjectAgendaRow[], field: SortField, direction: SortDirection): ProjectAgendaRow[] {
  const sorted = [...items].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "name":
        cmp = (a.title || "").localeCompare(b.title || "");
        break;
      case "priority":
        cmp = (priorityRankMap[a.priority] ?? 2) - (priorityRankMap[b.priority] ?? 2);
        break;
      case "type":
        cmp = (typeLabels[a.entity_type] || a.entity_type).localeCompare(typeLabels[b.entity_type] || b.entity_type);
        break;
      case "responsible":
        if (!a.owner_name && !b.owner_name) cmp = 0;
        else if (!a.owner_name) cmp = 1;
        else if (!b.owner_name) cmp = -1;
        else cmp = a.owner_name.localeCompare(b.owner_name);
        break;
      case "age":
        cmp = (a.age_days || 0) - (b.age_days || 0);
        break;
      case "score":
        cmp = (a.score || 0) - (b.score || 0);
        break;
    }
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function groupByPriority(items: ProjectAgendaRow[]) {
  const groups: Record<PriorityLevel, ProjectAgendaRow[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  items.forEach((item) => {
    groups[item.priority]?.push(item);
  });
  return groups;
}

export function AgendaView({
  project,
  initialItems,
  onCountChange,
}: {
  project: Project;
  initialItems: ProjectAgendaRow[];
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newAsk, setNewAsk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ title: string; context: string; ask: string; priority: PriorityLevel }>({ title: "", context: "", ask: "", priority: "medium" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<PriorityLevel>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const router = useRouter();
  const supabase = createClient();

  function toggleGroup(priority: PriorityLevel) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  }

  function toggleExpand(key: string) {
    setExpandedId((prev) => (prev === key ? null : key));
  }

  function handleEscalate(item: ProjectAgendaRow) {
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const rankToPriority: PriorityLevel[] = ["critical", "high", "medium", "low"];

    let newPriority: PriorityLevel | null = null;

    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.entity_type === item.entity_type && i.entity_id === item.entity_id
      );
      if (idx <= 0) return prev;
      const updated = [...prev];
      const aboveItem = updated[idx - 1];
      const currentPriRank = priorityRank[updated[idx].priority] ?? 2;
      const abovePriRank = priorityRank[aboveItem.priority] ?? 2;

      if (abovePriRank < currentPriRank) {
        newPriority = rankToPriority[abovePriRank];
        updated[idx] = { ...updated[idx], escalation_count: updated[idx].escalation_count + 1, priority: newPriority };
      } else {
        updated[idx] = { ...updated[idx], escalation_count: updated[idx].escalation_count + 1 };
      }

      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      return updated.map((it, i) => ({ ...it, rank: i + 1 }));
    });

    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";
    const updates: Record<string, unknown> = { escalation_count: item.escalation_count + 1 };
    if (newPriority) updates.priority = newPriority;
    supabase.from(table).update(updates).eq("id", item.entity_id);
  }

  function handleDeescalate(item: ProjectAgendaRow) {
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const rankToPriority: PriorityLevel[] = ["critical", "high", "medium", "low"];

    let newPriority: PriorityLevel | null = null;

    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.entity_type === item.entity_type && i.entity_id === item.entity_id
      );
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const updated = [...prev];
      const belowItem = updated[idx + 1];
      const currentPriRank = priorityRank[updated[idx].priority] ?? 2;
      const belowPriRank = priorityRank[belowItem.priority] ?? 2;

      if (belowPriRank > currentPriRank) {
        newPriority = rankToPriority[belowPriRank];
        updated[idx] = { ...updated[idx], priority: newPriority };
      }

      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      return updated.map((it, i) => ({ ...it, rank: i + 1 }));
    });

    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";
    if (newPriority) {
      supabase.from(table).update({ priority: newPriority }).eq("id", item.entity_id);
    }
  }

  async function handleResolve(item: ProjectAgendaRow) {
    const now = new Date().toISOString();
    if (item.entity_type === "agenda_item") {
      await supabase.from("agenda_items").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
    } else if (item.entity_type === "blocker") {
      await supabase.from("blockers").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
    } else if (item.entity_type === "action_item") {
      await supabase.from("action_items").update({ status: "complete", resolved_at: now }).eq("id", item.entity_id);
    }
    setItems(items.filter((i) => i.entity_id !== item.entity_id));
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
    });
    setNewTitle("");
    setNewContext("");
    setNewAsk("");
    setShowAddForm(false);
    router.refresh();
  }

  function startEdit(item: ProjectAgendaRow) {
    setEditingId(`${item.entity_type}-${item.entity_id}`);
    setEditFields({
      title: item.title,
      context: item.context || "",
      ask: item.ask || "",
      priority: item.priority,
    });
    setNotesText("");
  }

  async function handleSaveEdit(item: ProjectAgendaRow) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";

    // If notes present, process through AI
    if (notesText.trim()) {
      setSavingNotes(true);
      try {
        const res = await fetch("/api/agenda-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: item.entity_type,
            current: {
              title: editFields.title,
              context: editFields.context,
              ask: editFields.ask,
              priority: editFields.priority,
            },
            notes: notesText,
          }),
        });

        if (!res.ok) {
          console.error("AI processing failed");
          setSavingNotes(false);
          return;
        }

        const { updates: aiUpdates } = await res.json();

        // Merge AI updates with current form values
        const merged = {
          title: aiUpdates.title || editFields.title,
          context: aiUpdates.context !== undefined ? aiUpdates.context : editFields.context,
          ask: aiUpdates.ask !== undefined ? aiUpdates.ask : editFields.ask,
          priority: aiUpdates.priority || editFields.priority,
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

        // AI done — optimistic: update UI immediately, save in background
        setItems((prev) =>
          prev.map((i) =>
            i.entity_id === item.entity_id
              ? { ...i, title: merged.title, priority: merged.priority as PriorityLevel, context: merged.context || null, ask: merged.ask || null }
              : i
          )
        );
        setNotesText("");
        setEditingId(null);
        setSavingNotes(false);

        supabase.from(table).update(dbUpdates).eq("id", item.entity_id).then(({ error }) => {
          if (error) console.error("Save failed:", error);
        });
      } catch (err) {
        console.error("Save notes failed:", err);
        setSavingNotes(false);
      }
      return;
    }

    // No notes — optimistic: update UI immediately, save in background
    const updates: Record<string, unknown> = { title: editFields.title, priority: editFields.priority };
    if (item.entity_type === "agenda_item") {
      updates.context = editFields.context || null;
      updates.ask = editFields.ask || null;
    } else if (item.entity_type === "action_item") {
      updates.notes = editFields.context || null;
    } else if (item.entity_type === "blocker") {
      updates.impact_description = editFields.context || null;
    }

    setItems((prev) =>
      prev.map((i) =>
        i.entity_id === item.entity_id
          ? { ...i, title: editFields.title, priority: editFields.priority, context: editFields.context || null, ask: editFields.ask || null }
          : i
      )
    );
    setEditingId(null);

    supabase.from(table).update(updates).eq("id", item.entity_id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
  }

  async function handleDelete(item: ProjectAgendaRow) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";

    await supabase.from(table).delete().eq("id", item.entity_id);
    setItems(items.filter((i) => i.entity_id !== item.entity_id));
    router.refresh();
  }

  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(initialItems.length > 0);
  const [mode, setMode] = useState<"auto" | "selected">("auto");

  // Auto-load agenda on mount if not provided
  useEffect(() => {
    if (initialItems.length > 0) return;
    let cancelled = false;
    supabase.rpc("generate_project_agenda", { p_project_id: project.id, p_limit: 30 }).then(({ data }) => {
      if (!cancelled && data && (data as ProjectAgendaRow[]).length > 0) {
        setItems(data as ProjectAgendaRow[]);
        setHasGenerated(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    const rpcName = mode === "selected" ? "generate_project_agenda_from_selected" : "generate_project_agenda";
    const { data } = await supabase.rpc(rpcName, {
      p_project_id: project.id,
      p_limit: 30,
    });
    setItems((data || []) as ProjectAgendaRow[]);
    setHasGenerated(true);
    setGenerating(false);
  }

  function switchMode(newMode: "auto" | "selected") {
    if (newMode === mode) return;
    setMode(newMode);
    // Auto-regenerate on mode switch
    setGenerating(true);
    const rpcName = newMode === "selected" ? "generate_project_agenda_from_selected" : "generate_project_agenda";
    supabase.rpc(rpcName, { p_project_id: project.id, p_limit: 30 }).then(({ data }) => {
      setItems((data || []) as ProjectAgendaRow[]);
      setHasGenerated(true);
      setGenerating(false);
    });
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      if (sortDirection === "asc") setSortDirection("desc");
      else { setSortField(null); setSortDirection("asc"); }
    } else {
      setSortField(field);
      setSortDirection(field === "score" || field === "age" ? "desc" : "asc");
    }
  }

  const groups = groupByPriority(items);
  const sortedItems = sortField ? sortItems(items, sortField, sortDirection) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Meeting Agenda
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {items.length} items{mode === "selected" ? " from selected" : ""}, ranked by priority + age + escalations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
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
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Add Item
          </button>
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
            <button
              onClick={handleAddItem}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No agenda items. Add items or check project action items and blockers.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[2.5rem_1fr_5.5rem_5rem_9rem_4rem_4.5rem_6.5rem] gap-0 px-3 py-2 bg-gray-50 border-b border-gray-300 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <div></div>
            {(["name", "priority", "type", "responsible", "age", "score"] as SortField[]).map((field) => {
              const labels: Record<SortField, string> = { name: "Name", priority: "Priority", type: "Type", responsible: "Responsible", age: "Age", score: "Score" };
              const isActive = sortField === field;
              return (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={`flex items-center gap-1 text-left hover:text-gray-700 transition-colors ${isActive ? "text-gray-800" : ""}`}
                >
                  {labels[field]}
                  {isActive && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      {sortDirection === "asc" ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                    </svg>
                  )}
                </button>
              );
            })}
            <div className="text-right">Actions</div>
          </div>

          {/* Rows — flat sorted or grouped by priority */}
          {sortedItems ? (
            /* Flat sorted list */
            sortedItems.map((item) => {
              const itemKey = `${item.entity_type}-${item.entity_id}`;
              const isEditing = editingId === itemKey;
              const isExpanded = expandedId === itemKey;
              return (
                <div key={itemKey} className="border-b border-gray-200 last:border-b-0">
                  {isEditing ? (
                    <div className="px-3 py-3 bg-blue-50/30">
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-2 min-w-0">
                          <input type="text" value={editFields.title} onChange={(e) => setEditFields({ ...editFields, title: e.target.value })} className="w-full text-sm font-medium text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none" />
                          <textarea value={editFields.context} onChange={(e) => setEditFields({ ...editFields, context: e.target.value })} placeholder="Context" rows={2} className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y" />
                          <textarea value={editFields.ask} onChange={(e) => setEditFields({ ...editFields, ask: e.target.value })} placeholder="Ask" rows={2} className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y" />
                          <select value={editFields.priority} onChange={(e) => setEditFields({ ...editFields, priority: e.target.value as PriorityLevel })} className="text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none">
                            {priorityOptions.map((p) => (<option key={p} value={p}>{priorityLabels[p]}</option>))}
                          </select>
                        </div>
                        <div className="w-72 flex-shrink-0 space-y-1.5">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Call Notes</label>
                          <textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} placeholder="Take notes during the call..." rows={6} className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
                        <div className="flex-1" />
                        <button onClick={() => handleResolve(item)} className="px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50">Resolve</button>
                        <button onClick={() => handleSaveEdit(item)} disabled={savingNotes} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                          {savingNotes && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                          {savingNotes ? "Updating..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div onClick={() => toggleExpand(itemKey)} className="grid grid-cols-[2.5rem_1fr_5.5rem_5rem_9rem_4rem_4.5rem_6.5rem] gap-0 px-3 py-2.5 items-center hover:bg-gray-50/80 cursor-pointer transition-colors group">
                        <span className="text-xs font-mono text-gray-400">#{item.rank}</span>
                        <div className="min-w-0 pr-3">
                          <span className="text-sm font-semibold text-gray-900 truncate block">{item.title}</span>
                          {(item.context || item.ask) && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`inline-block ml-1 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                          )}
                        </div>
                        <div><span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${priorityColor(item.priority)}`}>{priorityLabels[item.priority]}</span></div>
                        <span className="text-xs text-gray-500">{typeLabels[item.entity_type] || item.entity_type}</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.owner_name ? (
                            <>
                              <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">{item.owner_name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                              <span className="text-xs text-gray-700 truncate">{item.owner_name}</span>
                            </>
                          ) : (<span className="text-xs text-gray-400 italic">Unassigned</span>)}
                        </div>
                        <span className="text-xs text-gray-500">{formatAge(item.age_days)}</span>
                        <span className="text-xs text-gray-400">{Math.round(item.score)}</span>
                        <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50" title="Edit"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                          <button onClick={() => handleEscalate(item)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Escalate"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg></button>
                          <button onClick={() => handleDeescalate(item)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50" title="De-escalate"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg></button>
                          <button onClick={() => handleResolve(item)} className="p-1 text-gray-400 hover:text-green-600 rounded hover:bg-green-50" title="Resolve"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></button>
                          <button onClick={() => handleDelete(item)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                        </div>
                      </div>
                      {isExpanded && (item.context || item.ask) && (
                        <div className="px-3 pb-3 pl-12 space-y-1 bg-gray-50/50">
                          {item.context && <p className="text-sm text-gray-600">{item.context}</p>}
                          {item.ask && <p className="text-sm text-blue-700"><span className="font-medium">Ask:</span> {item.ask}</p>}
                          {item.vendor_name && <p className="text-xs text-gray-400">Vendor: {item.vendor_name}</p>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            /* Default: grouped by priority */
            priorityOptions.map((priority) => {
            const groupItems = groups[priority];
            if (groupItems.length === 0) return null;
            const isCollapsed = collapsedGroups.has(priority);

            return (
              <div key={priority}>
                {/* Section header */}
                <button
                  onClick={() => toggleGroup(priority)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-800 border-b border-gray-900 hover:bg-gray-700 transition-colors text-left"
                >
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
                    className={`text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className={`w-2 h-2 rounded-full ${priorityDot(priority)}`} />
                  <span className="text-xs font-semibold text-white uppercase tracking-wide">
                    {priorityLabels[priority]}
                  </span>
                  <span className="text-xs text-gray-400">{groupItems.length}</span>
                </button>

                {/* Section rows */}
                {!isCollapsed && groupItems.map((item) => {
                  const itemKey = `${item.entity_type}-${item.entity_id}`;
                  const isEditing = editingId === itemKey;
                  const isExpanded = expandedId === itemKey;

                  return (
                    <div key={itemKey} className="border-b border-gray-200 last:border-b-0">
                      {isEditing ? (
                        <div className="px-3 py-3 bg-blue-50/30">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2 min-w-0">
                              <input
                                type="text"
                                value={editFields.title}
                                onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                                className="w-full text-sm font-medium text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                              />
                              <textarea
                                value={editFields.context}
                                onChange={(e) => setEditFields({ ...editFields, context: e.target.value })}
                                placeholder="Context"
                                rows={2}
                                className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y"
                              />
                              <textarea
                                value={editFields.ask}
                                onChange={(e) => setEditFields({ ...editFields, ask: e.target.value })}
                                placeholder="Ask"
                                rows={2}
                                className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y"
                              />
                              <select
                                value={editFields.priority}
                                onChange={(e) => setEditFields({ ...editFields, priority: e.target.value as PriorityLevel })}
                                className="text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none"
                              >
                                {priorityOptions.map((p) => (
                                  <option key={p} value={p}>{priorityLabels[p]}</option>
                                ))}
                              </select>
                            </div>
                            <div className="w-72 flex-shrink-0 space-y-1.5">
                              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Call Notes</label>
                              <textarea
                                value={notesText}
                                onChange={(e) => setNotesText(e.target.value)}
                                placeholder="Take notes during the call..."
                                rows={6}
                                className="w-full text-sm text-gray-900 rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none resize-y"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <div className="flex-1" />
                            <button
                              onClick={() => handleResolve(item)}
                              className="px-3 py-1.5 text-xs font-medium text-green-700 bg-white border border-green-300 rounded hover:bg-green-50"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => handleSaveEdit(item)}
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
                        <>
                          {/* Main row */}
                          <div
                            onClick={() => toggleExpand(itemKey)}
                            className="grid grid-cols-[2.5rem_1fr_5.5rem_5rem_9rem_4rem_4.5rem_6.5rem] gap-0 px-3 py-2.5 items-center hover:bg-gray-50/80 cursor-pointer transition-colors group"
                          >
                            {/* Rank */}
                            <span className="text-xs font-mono text-gray-400">#{item.rank}</span>

                            {/* Name */}
                            <div className="min-w-0 pr-3">
                              <span className="text-sm font-semibold text-gray-900 truncate block">{item.title}</span>
                              {(item.context || item.ask) && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  className={`inline-block ml-1 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              )}
                            </div>

                            {/* Priority */}
                            <div>
                              <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${priorityColor(item.priority)}`}>
                                {priorityLabels[item.priority]}
                              </span>
                            </div>

                            {/* Type */}
                            <span className="text-xs text-gray-500">
                              {typeLabels[item.entity_type] || item.entity_type}
                            </span>

                            {/* Responsible */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              {item.owner_name ? (
                                <>
                                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                                    {item.owner_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                  </span>
                                  <span className="text-xs text-gray-700 truncate">{item.owner_name}</span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 italic">Unassigned</span>
                              )}
                            </div>

                            {/* Age */}
                            <span className="text-xs text-gray-500">{formatAge(item.age_days)}</span>

                            {/* Score */}
                            <span className="text-xs text-gray-400">{Math.round(item.score)}</span>

                            {/* Actions */}
                            <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50" title="Edit">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button onClick={() => handleEscalate(item)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Escalate">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeescalate(item)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50" title="De-escalate">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                                </svg>
                              </button>
                              <button onClick={() => handleResolve(item)} className="p-1 text-gray-400 hover:text-green-600 rounded hover:bg-green-50" title="Resolve">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </button>
                              <button onClick={() => handleDelete(item)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (item.context || item.ask) && (
                            <div className="px-3 pb-3 pl-12 space-y-1 bg-gray-50/50">
                              {item.context && (
                                <p className="text-sm text-gray-600">{item.context}</p>
                              )}
                              {item.ask && (
                                <p className="text-sm text-blue-700">
                                  <span className="font-medium">Ask:</span> {item.ask}
                                </p>
                              )}
                              {item.vendor_name && (
                                <p className="text-xs text-gray-400">Vendor: {item.vendor_name}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}

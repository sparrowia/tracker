"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { severityBadge, priorityColor, formatAge } from "@/lib/utils";
import type { Vendor, VendorAgendaRow, PriorityLevel } from "@/lib/types";

const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];

export function AgendaView({
  vendor,
  initialItems,
}: {
  vendor: Vendor;
  initialItems: VendorAgendaRow[];
}) {
  const [items, setItems] = useState(initialItems);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContext, setNewContext] = useState("");
  const [newAsk, setNewAsk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{ title: string; context: string; ask: string; priority: PriorityLevel }>({ title: "", context: "", ask: "", priority: "medium" });
  const router = useRouter();
  const supabase = createClient();

  function handleEscalate(item: VendorAgendaRow) {
    const priorityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const rankToPriority: PriorityLevel[] = ["critical", "high", "medium", "low"];

    let newPriority: PriorityLevel | null = null;

    // Optimistic: move up immediately
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.entity_type === item.entity_type && i.entity_id === item.entity_id
      );
      if (idx <= 0) return prev;
      const updated = [...prev];
      const aboveItem = updated[idx - 1];
      const currentPriRank = priorityRank[updated[idx].priority] ?? 2;
      const abovePriRank = priorityRank[aboveItem.priority] ?? 2;

      // If moving into a higher priority bracket, adopt that priority
      if (abovePriRank < currentPriRank) {
        newPriority = rankToPriority[abovePriRank];
        updated[idx] = { ...updated[idx], escalation_count: updated[idx].escalation_count + 1, priority: newPriority };
      } else {
        updated[idx] = { ...updated[idx], escalation_count: updated[idx].escalation_count + 1 };
      }

      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      return updated.map((it, i) => ({ ...it, rank: i + 1 }));
    });

    // Persist in background
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";
    const updates: Record<string, unknown> = { escalation_count: item.escalation_count + 1 };
    if (newPriority) updates.priority = newPriority;
    supabase.from(table).update(updates).eq("id", item.entity_id);
  }

  async function handleResolve(item: VendorAgendaRow) {
    const now = new Date().toISOString();
    if (item.entity_type === "agenda_item") {
      await supabase
        .from("agenda_items")
        .update({ status: "complete", resolved_at: now })
        .eq("id", item.entity_id);
    } else if (item.entity_type === "blocker") {
      await supabase
        .from("blockers")
        .update({ status: "complete", resolved_at: now })
        .eq("id", item.entity_id);
    } else if (item.entity_type === "action_item") {
      await supabase
        .from("action_items")
        .update({ status: "complete", resolved_at: now })
        .eq("id", item.entity_id);
    }
    setItems(items.filter((i) => i.entity_id !== item.entity_id));
    router.refresh();
  }

  async function handleAddItem() {
    if (!newTitle.trim()) return;
    await supabase.from("agenda_items").insert({
      vendor_id: vendor.id,
      title: newTitle.trim(),
      context: newContext.trim() || null,
      ask: newAsk.trim() || null,
      severity: "new",
      priority: "medium",
      org_id: vendor.org_id,
    });
    setNewTitle("");
    setNewContext("");
    setNewAsk("");
    setShowAddForm(false);
    router.refresh();
  }

  function startEdit(item: VendorAgendaRow) {
    setEditingId(`${item.entity_type}-${item.entity_id}`);
    setEditFields({
      title: item.title,
      context: item.context || "",
      ask: item.ask || "",
      priority: item.priority,
    });
  }

  async function handleSaveEdit(item: VendorAgendaRow) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";

    const updates: Record<string, unknown> = { title: editFields.title, priority: editFields.priority };
    if (item.entity_type === "agenda_item") {
      updates.context = editFields.context || null;
      updates.ask = editFields.ask || null;
    } else if (item.entity_type === "action_item") {
      updates.notes = editFields.context || null;
    } else if (item.entity_type === "blocker") {
      updates.impact_description = editFields.context || null;
    }

    await supabase.from(table).update(updates).eq("id", item.entity_id);
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(item: VendorAgendaRow) {
    const table = item.entity_type === "agenda_item" ? "agenda_items"
      : item.entity_type === "blocker" ? "blockers" : "action_items";

    await supabase.from(table).delete().eq("id", item.entity_id);
    setItems(items.filter((i) => i.entity_id !== item.entity_id));
    router.refresh();
  }

  function exportMarkdown() {
    const lines = [
      `# ${vendor.name} Meeting Agenda`,
      `**Generated:** ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`,
      "",
      "| # | Severity | Topic | Context | Ask | Owner |",
      "|---|----------|-------|---------|-----|-------|",
    ];

    items.forEach((item) => {
      lines.push(
        `| ${item.rank} | ${item.severity.toUpperCase()} | ${item.title} | ${item.context || "—"} | ${item.ask || "—"} | ${item.owner_name || "—"} |`
      );
    });

    navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {vendor.name} Meeting Agenda
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} items, ranked by priority + age + escalations
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Add Item
          </button>
          <button
            onClick={exportMarkdown}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Copy as Markdown
          </button>
        </div>
      </div>

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
        <p className="text-sm text-gray-500">No agenda items. Add items or check vendor action items and blockers.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const sev = severityBadge(item.severity);
            const itemKey = `${item.entity_type}-${item.entity_id}`;
            const isEditing = editingId === itemKey;
            return (
              <div
                key={itemKey}
                className="bg-white rounded-lg border border-gray-200 p-4"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editFields.title}
                      onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                      className="w-full text-sm font-medium text-gray-900 rounded border border-gray-200 px-2 py-1 focus:border-blue-500 focus:outline-none"
                    />
                    <textarea
                      value={editFields.context}
                      onChange={(e) => setEditFields({ ...editFields, context: e.target.value })}
                      placeholder="Context"
                      rows={2}
                      className="w-full text-sm text-gray-900 rounded border border-gray-200 px-2 py-1 focus:border-blue-500 focus:outline-none resize-y"
                    />
                    <textarea
                      value={editFields.ask}
                      onChange={(e) => setEditFields({ ...editFields, ask: e.target.value })}
                      placeholder="Ask"
                      rows={2}
                      className="w-full text-sm text-gray-900 rounded border border-gray-200 px-2 py-1 focus:border-blue-500 focus:outline-none resize-y"
                    />
                    <select
                      value={editFields.priority}
                      onChange={(e) => setEditFields({ ...editFields, priority: e.target.value as PriorityLevel })}
                      className="text-sm text-gray-900 rounded border border-gray-200 px-2 py-1 focus:border-blue-500 focus:outline-none"
                    >
                      {priorityOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item)}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-gray-400">#{item.rank}</span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${sev.className}`}>
                        {sev.label}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(item.priority)}`}>
                        {item.priority}
                      </span>
                      <span className="text-xs text-gray-400">
                        {item.entity_type === "blocker" ? "Blocker" : item.entity_type === "action_item" ? "Action" : "Agenda"}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    {item.context && (
                      <p className="text-sm text-gray-600 mt-1">{item.context}</p>
                    )}
                    {item.ask && (
                      <p className="text-sm text-blue-700 mt-1">
                        <span className="font-medium">Ask:</span> {item.ask}
                      </p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      {item.owner_name && <span>Owner: {item.owner_name}</span>}
                      {item.project_name && <span>Project: {item.project_name}</span>}
                      <span>Age: {formatAge(item.age_days)}</span>
                      <span className="text-gray-400">Score: {Math.round(item.score)}</span>
                    </div>
                    <div className="flex justify-end items-center gap-2 mt-2">
                      {/* Edit */}
                      <button
                        onClick={() => startEdit(item)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="Edit"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                      {/* Escalate */}
                      <button
                        onClick={() => handleEscalate(item)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Escalate"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="19" x2="12" y2="5"/>
                          <polyline points="5 12 12 5 19 12"/>
                        </svg>
                      </button>
                      {/* Resolve */}
                      <button
                        onClick={() => handleResolve(item)}
                        className="text-green-500 hover:text-green-700 transition-colors"
                        title="Resolve"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

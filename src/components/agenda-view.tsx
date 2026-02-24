"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { severityBadge, priorityColor, formatAge } from "@/lib/utils";
import type { Vendor, VendorAgendaRow } from "@/lib/types";

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
  const router = useRouter();
  const supabase = createClient();

  async function handleEscalate(item: VendorAgendaRow) {
    if (item.entity_type === "agenda_item") {
      await supabase
        .from("agenda_items")
        .update({ escalation_count: item.escalation_count + 1 })
        .eq("id", item.entity_id);
    } else if (item.entity_type === "blocker") {
      await supabase
        .from("blockers")
        .update({ escalation_count: item.escalation_count + 1 })
        .eq("id", item.entity_id);
    } else if (item.entity_type === "action_item") {
      await supabase
        .from("action_items")
        .update({ escalation_count: item.escalation_count + 1 })
        .eq("id", item.entity_id);
    }
    router.refresh();
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
            return (
              <div
                key={`${item.entity_type}-${item.entity_id}`}
                className="bg-white rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
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
                      {item.escalation_count > 0 && (
                        <span className="text-orange-600 font-medium">
                          Escalated {item.escalation_count}x
                        </span>
                      )}
                      <span className="text-gray-400">Score: {Math.round(item.score)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEscalate(item)}
                      className="px-2 py-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100"
                    >
                      Escalate
                    </button>
                    <button
                      onClick={() => handleResolve(item)}
                      className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import { priorityColor, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Project, ActionItem, RaidEntry, Blocker, Person, Vendor, ProjectAgendaRow } from "@/lib/types";
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
          <BlockersPanel blockers={blockers} />
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

function BlockersPanel({
  blockers,
}: {
  blockers: (Blocker & { owner: Person | null; vendor: Vendor | null })[];
}) {
  if (blockers.length === 0) {
    return <p className="text-sm text-gray-500">No active blockers.</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-red-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Active Blockers</h2>
      </div>
      <table className="min-w-full">
        <thead className="bg-red-50 border-b border-gray-300">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Blocker</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Responsible</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Age</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-red-700 uppercase">Impact</th>
          </tr>
        </thead>
        <tbody>
          {blockers.map((b) => (
            <tr key={b.id} className="border-b border-gray-200">
              <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{b.title}</td>
              <td className="px-4 py-3 text-sm">
                {b.owner ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                      {b.owner.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </span>
                    <span className="text-gray-700">{b.owner.full_name}</span>
                  </div>
                ) : (
                  <span className="text-gray-400 italic">Unassigned</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-red-700 font-medium">
                {b.age_days != null ? formatAge(b.age_days) : "—"}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{b.impact_description || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

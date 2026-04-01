"use client";

import { useState } from "react";
import Link from "next/link";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { VendorAccountabilityRow } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = { action_item: "Action", blocker: "Blocker", raid_entry: "RAID" };
const TYPE_COLORS: Record<string, string> = { action_item: "bg-blue-100 text-blue-700", blocker: "bg-red-100 text-red-700", raid_entry: "bg-amber-100 text-amber-700" };

interface ProjectTab {
  projectId: string | null;
  projectName: string;
  projectSlug: string | null;
  count: number;
}

export function VendorOpenItems({
  items,
  ownerMap,
  projectTabs,
}: {
  items: VendorAccountabilityRow[];
  ownerMap: Record<string, string>;
  projectTabs: ProjectTab[];
}) {
  const [activeTab, setActiveTab] = useState<string>(projectTabs.length > 0 ? (projectTabs[0].projectId || "__all__") : "__all__");

  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Open Items</h2>
        <p className="text-sm text-gray-500">No open items for this vendor.</p>
      </div>
    );
  }

  const showAll = activeTab === "__all__";
  const filtered = showAll ? items : items.filter((i) => (i.project_id || "__none__") === activeTab);

  return (
    <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Open Items ({items.length})</h2>
      </div>

      {/* Project tabs */}
      {projectTabs.length > 1 && (
        <div className="flex items-center gap-0 border-b border-gray-300 bg-gray-50 overflow-x-auto">
          <button
            onClick={() => setActiveTab("__all__")}
            className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              showAll ? "border-blue-600 text-blue-700 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            All ({items.length})
          </button>
          {projectTabs.map((tab) => (
            <button
              key={tab.projectId || "__none__"}
              onClick={() => setActiveTab(tab.projectId || "__none__")}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === (tab.projectId || "__none__") ? "border-blue-600 text-blue-700 bg-white" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.projectName} ({tab.count})
            </button>
          ))}
        </div>
      )}

      {/* Active tab header with link */}
      {!showAll && projectTabs.find((t) => (t.projectId || "__none__") === activeTab)?.projectSlug && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-end">
          <Link
            href={`/projects/${projectTabs.find((t) => (t.projectId || "__none__") === activeTab)!.projectSlug}`}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            View Project →
          </Link>
        </div>
      )}

      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-300">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const badge = statusBadge(item.status);
            const ownerName = item.owner_id ? ownerMap[item.owner_id] : null;
            return (
              <tr key={`${item.entity_type}-${item.entity_id}`} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${TYPE_COLORS[item.entity_type] || "bg-gray-100 text-gray-700"}`}>
                    {TYPE_LABELS[item.entity_type] || item.entity_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{item.title}</td>
                <td className="px-4 py-3 text-sm">
                  {ownerName ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                        {ownerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-gray-700">{ownerName}</span>
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>
                    {priorityLabel(item.priority)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatAge(item.age_days)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400">No items for this project.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

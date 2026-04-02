"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import OwnerPicker from "@/components/owner-picker";
import CommentThread from "@/components/comment-thread";
import type { VendorAccountabilityRow, Person, PriorityLevel, ItemStatus } from "@/lib/types";

function formatRelative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return formatDateShort(date);
}

const TYPE_LABELS: Record<string, string> = { action_item: "Action", blocker: "Blocker", raid_entry: "Issue" };
const TYPE_COLORS: Record<string, string> = { action_item: "bg-blue-100 text-blue-700", blocker: "bg-red-100 text-red-700", raid_entry: "bg-amber-100 text-amber-700" };
const PRIORITY_OPTIONS: PriorityLevel[] = ["critical", "high", "medium", "low"];
const STATUS_OPTIONS: ItemStatus[] = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked", "rejected"];

interface ProjectTab {
  projectId: string | null;
  projectName: string;
  projectSlug: string | null;
  count: number;
}

export function VendorOpenItems({
  items: initialItems,
  ownerMap: initialOwnerMap,
  projectTabs,
  orgId,
}: {
  items: VendorAccountabilityRow[];
  ownerMap: Record<string, string>;
  projectTabs: ProjectTab[];
  orgId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [ownerMap, setOwnerMap] = useState(initialOwnerMap);
  const [activeTab, setActiveTab] = useState<string>("__urgent__");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const supabase = createClient();
  const { role } = useRole();
  const canEdit = role === "super_admin" || role === "admin" || role === "user";

  async function ensurePeople() {
    if (people.length > 0) return;
    const { data } = await supabase.from("people").select("*").order("full_name");
    if (data) setPeople(data as Person[]);
  }

  function tableName(entityType: string) {
    if (entityType === "action_item") return "action_items";
    if (entityType === "blocker") return "blockers";
    return "raid_entries";
  }

  async function toggleExpand(item: VendorAccountabilityRow) {
    const key = `${item.entity_type}-${item.entity_id}`;
    if (expandedId === key) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(key);
    await ensurePeople();
    const { data } = await supabase.from(tableName(item.entity_type)).select("*").eq("id", item.entity_id).single();
    if (data) setDetail(data);
  }

  async function saveField(item: VendorAccountabilityRow, field: string, value: string) {
    await supabase.from(tableName(item.entity_type)).update({ [field]: value || null }).eq("id", item.entity_id);
    if (["status", "priority", "due_date", "title"].includes(field)) {
      setItems((prev) => prev.map((i) => i.entity_id === item.entity_id ? { ...i, [field]: value } as VendorAccountabilityRow : i));
    }
    if (field === "owner_id") {
      setItems((prev) => prev.map((i) => i.entity_id === item.entity_id ? { ...i, owner_id: value || null } as VendorAccountabilityRow : i));
      const person = people.find((p) => p.id === value);
      if (person) setOwnerMap((prev) => ({ ...prev, [value]: person.full_name }));
    }
    if (detail) setDetail({ ...detail, [field]: value || null });
  }

  if (projectTabs.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Projects</h2>
        <p className="text-sm text-gray-500">No projects linked to this vendor.</p>
      </div>
    );
  }

  const urgentItems = items.filter((i) => i.priority === "critical" || i.priority === "high");
  const isUrgent = activeTab === "__urgent__";
  const isAll = activeTab === "__all__";
  let filtered = isUrgent ? urgentItems : isAll ? [...items] : items.filter((i) => (i.project_id || "__none__") === activeTab);
  if (filterType) filtered = filtered.filter((i) => i.entity_type === filterType);
  if (filterOwner) filtered = filtered.filter((i) => i.owner_id === filterOwner);
  if (filterPriority) filtered = filtered.filter((i) => i.priority === filterPriority);
  if (filterStatus) filtered = filtered.filter((i) => i.status === filterStatus);
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    filtered = filtered.filter((i) => i.title.toLowerCase().includes(q) || (i.owner_id && (ownerMap[i.owner_id] || "").toLowerCase().includes(q)));
  }
  const activeProject = (isUrgent || isAll) ? null : projectTabs.find((t) => (t.projectId || "__none__") === activeTab);

  // Get unique values for filter dropdowns from current tab's unfiltered items
  const tabItems = isUrgent ? urgentItems : isAll ? items : items.filter((i) => (i.project_id || "__none__") === activeTab);
  const uniqueOwners = Array.from(new Set(tabItems.map((i) => i.owner_id).filter(Boolean))) as string[];
  const uniqueStatuses = Array.from(new Set(tabItems.map((i) => i.status)));
  const hasFilters = filterType || filterOwner || filterPriority || filterStatus || searchFilter;

  function clearFilters() { setFilterType(""); setFilterOwner(""); setFilterPriority(""); setFilterStatus(""); setSearchFilter(""); }

  function switchTab(tab: string) {
    setActiveTab(tab); setExpandedId(null); setDetail(null); clearFilters();
  }

  return (
    <div>
      {/* Project tabs */}
      <div className="flex items-center border-b border-gray-300 overflow-x-auto">
        <button
          onClick={() => { switchTab("__urgent__"); }}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            isUrgent ? "border-red-600 text-red-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🔥{urgentItems.length > 0 && <span className={`ml-1.5 text-xs ${isUrgent ? "text-red-500" : "text-gray-400"}`}>{urgentItems.length}</span>}
        </button>
        <button
          onClick={() => { switchTab("__all__"); }}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            activeTab === "__all__" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All <span className={`ml-1.5 text-xs ${activeTab === "__all__" ? "text-blue-500" : "text-gray-400"}`}>{items.length}</span>
        </button>
        {projectTabs.map((tab) => {
          const key = tab.projectId || "__none__";
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => { switchTab(key); }}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.projectName}
              {tab.count > 0 && <span className={`ml-1.5 text-xs ${isActive ? "text-blue-500" : "text-gray-400"}`}>{tab.count}</span>}
            </button>
          );
        })}
      </div>

      {/* View Project link + Search */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {activeProject?.projectSlug && (
            <Link href={`/projects/${activeProject.projectSlug}`} className="text-xs text-blue-600 hover:text-blue-800">
              View Project →
            </Link>
          )}
        </div>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter..."
            className="pl-8 pr-3 py-1 text-sm border border-gray-300 rounded-md w-48 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Filters row — RAID log style */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-wrap">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Filters</span>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:border-blue-400">
          <option value="">Type</option>
          <option value="action_item">Action</option>
          <option value="blocker">Blocker</option>
          <option value="raid_entry">Issue</option>
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:border-blue-400">
          <option value="">Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:border-blue-400">
          <option value="">Status</option>
          {uniqueStatuses.sort().map((s) => <option key={s} value={s}>{statusBadge(s).label}</option>)}
        </select>
        <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:outline-none focus:border-blue-400">
          <option value="">Owner</option>
          {uniqueOwners.map((id) => <option key={id} value={id}>{ownerMap[id] || "Unknown"}</option>)}
        </select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 ml-1">Clear</button>
        )}
        {hasFilters && (
          <span className="text-[10px] text-gray-400 ml-auto">{filtered.length}/{tabItems.length}</span>
        )}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">{hasFilters ? "No items match filters." : "No items for this project."}</div>
      ) : (
        <div>
          {/* Column headers */}
          <div className="grid grid-cols-[60px_1fr_140px_80px_80px_80px_90px] bg-gray-50 border-b border-gray-300 px-4 py-2">
            <span className="text-xs font-medium text-gray-500 uppercase">Type</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Item</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Responsible</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Priority</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Due</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Updated</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
          </div>

          {filtered.map((item) => {
            const badge = statusBadge(item.status);
            const ownerName = item.owner_id ? ownerMap[item.owner_id] : null;
            const key = `${item.entity_type}-${item.entity_id}`;
            const isExpanded = expandedId === key;

            return (
              <div key={key}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(item)}
                  className={`grid grid-cols-[60px_1fr_140px_80px_80px_80px_90px] px-4 py-3 border-b border-gray-200 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/40" : "hover:bg-gray-50"}`}
                >
                  <span>
                    <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${TYPE_COLORS[item.entity_type] || "bg-gray-100 text-gray-700"}`}>
                      {TYPE_LABELS[item.entity_type] || item.entity_type}
                    </span>
                  </span>
                  <span className="text-sm text-gray-900 font-semibold truncate pr-4">{item.title}</span>
                  <span className="text-sm">
                    {ownerName ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                          {ownerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                        <span className="text-gray-700 truncate">{ownerName}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">Unassigned</span>
                    )}
                  </span>
                  <span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>
                      {priorityLabel(item.priority)}
                    </span>
                  </span>
                  <span className="text-sm text-gray-600">{formatDateShort(item.due_date)}</span>
                  <span className="text-sm text-gray-600">{formatRelative(item.updated_at)}</span>
                  <span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </span>
                </div>

                {/* Expanded detail panel — matches RAID log layout */}
                {isExpanded && detail && (
                  <div key={`detail-${item.entity_id}`} className="bg-yellow-50/25 border-b border-gray-300" onClick={(e) => e.stopPropagation()}>
                    {/* Title */}
                    <div className="px-5 pt-4 pb-3 text-base font-semibold text-gray-900 bg-yellow-50/25">
                      {item.title}
                    </div>

                    {/* Description & Meeting Notes — side by side */}
                    <div className="grid grid-cols-2 gap-4 px-5 py-3 border-t border-gray-200 bg-yellow-50/25">
                      <div className="rounded border border-gray-200 bg-white p-3">
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Description</span>
                        {canEdit ? (
                          <textarea
                            defaultValue={(detail.description as string) || (detail.impact_description as string) || ""}
                            onBlur={(e) => saveField(item, item.entity_type === "blocker" ? "impact_description" : "description", e.target.value)}
                            placeholder="Add description..."
                            rows={6}
                            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{(detail.description as string) || (detail.impact_description as string) || "—"}</p>
                        )}
                      </div>
                      <div className="rounded border border-gray-200 bg-white p-3">
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                          {item.entity_type === "blocker" ? "Impact / Notes" : "Meeting Notes"}
                        </span>
                        {canEdit ? (
                          <textarea
                            defaultValue={item.entity_type === "blocker" ? ((detail.impact_description as string) || "") : ((detail.notes as string) || "")}
                            onBlur={(e) => saveField(item, item.entity_type === "blocker" ? "impact_description" : "notes", e.target.value)}
                            placeholder={item.entity_type === "blocker" ? "Add impact / notes..." : "Add meeting notes..."}
                            rows={6}
                            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                            {item.entity_type === "blocker" ? ((detail.impact_description as string) || "—") : ((detail.notes as string) || "—")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Next Steps */}
                    {(item.entity_type === "raid_entry" || item.entity_type === "action_item") && (
                      <div className="px-5 pb-3">
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Next Steps</span>
                        {canEdit ? (
                          <textarea
                            defaultValue={(detail.next_steps as string) || ""}
                            onBlur={(e) => saveField(item, "next_steps", e.target.value)}
                            placeholder="Next steps..."
                            rows={2}
                            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none mt-1"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap font-bold">{(detail.next_steps as string) || "—"}</p>
                        )}
                      </div>
                    )}

                    {/* Properties grid */}
                    <div className="border-t border-gray-200 bg-white">
                      <div className="grid grid-cols-[120px_1fr_120px_1fr] items-stretch">
                        {/* Row: Priority / Status */}
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Priority</span>
                        <div className="px-3 py-2.5 border-b border-gray-200">
                          {canEdit ? (
                            <select value={item.priority} onChange={(e) => saveField(item, "priority", e.target.value)} className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5">
                              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
                            </select>
                          ) : priorityLabel(item.priority)}
                        </div>
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Status</span>
                        <div className="px-3 py-2.5 border-b border-gray-200">
                          {canEdit ? (
                            <select value={item.status} onChange={(e) => saveField(item, "status", e.target.value)} className="text-sm rounded border border-transparent hover:border-gray-300 bg-transparent py-0 focus:border-blue-500 focus:outline-none cursor-pointer -ml-0.5">
                              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusBadge(s).label}</option>)}
                            </select>
                          ) : badge.label}
                        </div>

                        {/* Row: Owner / Vendor */}
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Owner</span>
                        <div className="px-3 py-1.5 border-b border-gray-200">
                          {canEdit ? (
                            <OwnerPicker value={item.owner_id || ""} onChange={(id) => saveField(item, "owner_id", id)} people={people} onPersonAdded={(p) => setPeople((prev) => [...prev, p])} />
                          ) : (ownerName || "Unassigned")}
                        </div>
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Due Date</span>
                        <div className="px-3 py-2.5 border-b border-gray-200">
                          {canEdit ? (
                            <input type="date" value={(detail.due_date as string) || ""} onChange={(e) => saveField(item, "due_date", e.target.value)} className="text-sm border border-transparent hover:border-gray-300 rounded bg-transparent -ml-1 cursor-pointer" />
                          ) : formatDateShort(item.due_date)}
                        </div>

                        {/* Row: Opened / Last Updated */}
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Opened</span>
                        <div className="px-3 py-2.5 border-b border-gray-200">
                          <span className="text-sm text-gray-700">{new Date(item.first_flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-l border-gray-200">Last Updated</span>
                        <div className="px-3 py-2.5 border-b border-gray-200">
                          <span className="text-sm text-gray-700">{formatRelative(item.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Comments */}
                    <div className="bg-yellow-50/25">
                      <CommentThread
                        {...(item.entity_type === "raid_entry" ? { raidEntryId: item.entity_id } : item.entity_type === "action_item" ? { actionItemId: item.entity_id } : { blockerId: item.entity_id })}
                        orgId={orgId}
                        people={people}
                        itemTitle={item.title}
                        itemType={TYPE_LABELS[item.entity_type] || item.entity_type}
                        projectSlug={activeProject?.projectSlug || undefined}
                        ownerId={item.owner_id}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

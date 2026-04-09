"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import OwnerPicker from "@/components/owner-picker";
import VendorPicker from "@/components/vendor-picker";
import CommentThread from "@/components/comment-thread";
import type { VendorAccountabilityRow, Person, Vendor, PriorityLevel, ItemStatus } from "@/lib/types";

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
  vendorId,
}: {
  items: VendorAccountabilityRow[];
  ownerMap: Record<string, string>;
  projectTabs: ProjectTab[];
  orgId: string;
  vendorId: string;
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<"action_item" | "blocker" | "raid_entry">("action_item");
  const [addTitle, setAddTitle] = useState("");
  const [addPriority, setAddPriority] = useState<PriorityLevel>("medium");
  const [addSaving, setAddSaving] = useState(false);
  const supabase = createClient();
  const { role, profileId } = useRole();
  const canEdit = role === "super_admin" || role === "admin" || role === "user";

  // Project name map for the Project column
  const projectNameMap: Record<string, string> = {};
  for (const tab of projectTabs) {
    if (tab.projectId) projectNameMap[tab.projectId] = tab.projectName;
  }

  async function ensurePeople() {
    if (people.length > 0) return;
    const [{ data: ppl }, { data: vnd }] = await Promise.all([
      supabase.from("people").select("*").order("full_name"),
      supabase.from("vendors").select("*").order("name"),
    ]);
    if (ppl) setPeople(ppl as Person[]);
    if (vnd) setVendors(vnd as Vendor[]);
  }

  function tableName(entityType: string) {
    if (entityType === "action_item") return "action_items";
    if (entityType === "blocker") return "blockers";
    return "raid_entries";
  }

  async function toggleExpand(item: VendorAccountabilityRow) {
    const key = `${item.entity_type}-${item.entity_id}`;
    if (expandedId === key) { setExpandedId(null); setDetail(null); return; }
    setDetail(null); // Clear old data immediately so stale content doesn't show
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

  async function addItem() {
    if (!addTitle.trim() || addSaving) return;
    setAddSaving(true);
    const now = new Date().toISOString();
    let newItem: VendorAccountabilityRow | null = null;

    if (addType === "action_item") {
      const { data } = await supabase.from("action_items").insert({
        org_id: orgId,
        title: addTitle.trim(),
        priority: addPriority,
        vendor_id: vendorId,
        status: "pending",
        created_by: profileId,
      }).select("*").single();
      if (data) {
        newItem = {
          entity_type: "action_item",
          entity_id: data.id,
          vendor_id: vendorId,
          org_id: orgId,
          title: data.title,
          status: data.status,
          priority: data.priority,
          due_date: data.due_date,
          first_flagged_at: data.first_flagged_at || now,
          age_days: 0,
          updated_at: data.updated_at || now,
          owner_id: data.owner_id,
          project_id: data.project_id,
        };
      }
    } else if (addType === "blocker") {
      const { data } = await supabase.from("blockers").insert({
        org_id: orgId,
        title: addTitle.trim(),
        priority: addPriority,
        vendor_id: vendorId,
        status: "pending",
        created_by: profileId,
      }).select("*").single();
      if (data) {
        newItem = {
          entity_type: "blocker",
          entity_id: data.id,
          vendor_id: vendorId,
          org_id: orgId,
          title: data.title,
          status: data.status,
          priority: data.priority,
          due_date: data.due_date,
          first_flagged_at: data.first_flagged_at || now,
          age_days: 0,
          updated_at: data.updated_at || now,
          owner_id: data.owner_id,
          project_id: data.project_id,
        };
      }
    } else {
      const { data } = await supabase.from("raid_entries").insert({
        org_id: orgId,
        title: addTitle.trim(),
        priority: addPriority,
        vendor_id: vendorId,
        raid_type: "issue",
        status: "pending",
        created_by: profileId,
      }).select("*").single();
      if (data) {
        newItem = {
          entity_type: "raid_entry",
          entity_id: data.id,
          vendor_id: vendorId,
          org_id: orgId,
          title: data.title,
          status: data.status,
          priority: data.priority,
          due_date: data.due_date,
          first_flagged_at: data.first_flagged_at || now,
          age_days: 0,
          updated_at: data.updated_at || now,
          owner_id: data.owner_id,
          project_id: data.project_id,
        };
      }
    }

    if (newItem) {
      setItems((prev) => [newItem!, ...prev]);
    }
    setAddTitle("");
    setAddPriority("medium");
    setShowAddForm(false);
    setAddSaving(false);
  }

  if (projectTabs.length === 0 && items.length === 0) {
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
      <div className="flex items-center border-b border-gray-300">
        <div className="flex items-center overflow-x-auto flex-1">
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
        {canEdit && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-xs font-medium text-white bg-gray-800 px-2.5 py-1 rounded hover:bg-gray-700 mr-3 flex-shrink-0"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Add Item form */}
      {showAddForm && (
        <div className="px-4 py-3 bg-blue-50 border-b border-gray-200 flex items-center gap-3">
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value as "action_item" | "blocker" | "raid_entry")}
            className="text-xs rounded border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:border-blue-400"
          >
            <option value="action_item">Action Item</option>
            <option value="blocker">Blocker</option>
            <option value="raid_entry">Issue</option>
          </select>
          <input
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setShowAddForm(false); }}
            placeholder="Item title..."
            autoFocus
            className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={addPriority}
            onChange={(e) => setAddPriority(e.target.value as PriorityLevel)}
            className="text-xs rounded border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:border-blue-400"
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{priorityLabel(p)}</option>)}
          </select>
          <button
            onClick={addItem}
            disabled={!addTitle.trim() || addSaving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {addSaving ? "Adding..." : "Add"}
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="px-2 py-1.5 text-xs text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      )}

      {/* View Project link + Search + Add button */}
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
          <div className="grid grid-cols-[60px_1fr_100px_140px_80px_80px_80px_90px] bg-gray-50 border-b border-gray-300 px-4 py-2">
            <span className="text-xs font-medium text-gray-500 uppercase">Type</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Item</span>
            <span className="text-xs font-medium text-gray-500 uppercase">Project</span>
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
                  className={`grid grid-cols-[60px_1fr_100px_140px_80px_80px_80px_90px] px-4 py-3 border-b border-gray-200 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/40" : "hover:bg-gray-50"}`}
                >
                  <span>
                    <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${TYPE_COLORS[item.entity_type] || "bg-gray-100 text-gray-700"}`}>
                      {TYPE_LABELS[item.entity_type] || item.entity_type}
                    </span>
                  </span>
                  <span className="text-sm text-gray-900 font-semibold truncate pr-4">{item.title}</span>
                  <span className="text-xs text-gray-500 truncate">
                    {item.project_id ? (
                      <Link
                        href={`/projects/${projectTabs.find((t) => t.projectId === item.project_id)?.projectSlug || ""}`}
                        className="hover:text-blue-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {projectNameMap[item.project_id] || "—"}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </span>
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
                            defaultValue={(detail.description as string) || ""}
                            onBlur={(e) => saveField(item, "description", e.target.value)}
                            placeholder="Add description..."
                            rows={6}
                            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y mt-1"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{(detail.description as string) || "—"}</p>
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

                        {/* Row: Vendor */}
                        <span className="px-5 py-2.5 text-xs font-medium text-gray-400 bg-gray-50/50 border-b border-gray-200">Vendor</span>
                        <div className="px-3 py-1.5 border-b border-gray-200">
                          {canEdit ? (
                            <VendorPicker
                              value={item.vendor_id || ""}
                              onChange={(id) => {
                                supabase.from(tableName(item.entity_type)).update({ vendor_id: id || null }).eq("id", item.entity_id).then(() => {});
                                // Remove from list if vendor changed
                                setItems((prev) => prev.filter((i) => i.entity_id !== item.entity_id));
                                setExpandedId(null);
                                setDetail(null);
                              }}
                              vendors={vendors}
                              onVendorAdded={(v) => setVendors((prev) => [...prev, v])}
                            />
                          ) : (
                            <span className="text-sm text-gray-700">{vendors.find((v) => v.id === item.vendor_id)?.name || "—"}</span>
                          )}
                        </div>
                        <span className="px-5 py-2.5 bg-gray-50/50 border-b border-l border-gray-200" />
                        <div className="px-3 py-2.5 border-b border-gray-200" />
                      </div>
                    </div>

                    {/* Open in project link */}
                    {item.project_id && (
                      <div className="flex justify-end px-5 py-2 bg-yellow-50/25 border-t border-gray-200">
                        <a
                          href={`/projects/${projectTabs.find((t) => t.projectId === item.project_id)?.projectSlug || ""}?item=${item.entity_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          Open in Project
                        </a>
                      </div>
                    )}

                    {/* Changelog toggle */}
                    <VendorChangelogToggle
                      entityType={item.entity_type}
                      entityId={item.entity_id}
                      orgId={orgId}
                      people={people}
                    />

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

const CHANGELOG_FIELD_LABELS: Record<string, string> = {
  status: "Status", priority: "Priority", owner_id: "Owner", reporter_id: "Reporter",
  vendor_id: "Vendor", raid_type: "Type", impact: "Impact", due_date: "Due Date",
  decision_date: "Decision Date", title: "Title", description: "Description",
  impact_description: "Impact", notes: "Notes", next_steps: "Next Steps",
  parent_id: "Parent", comment: "Comment",
  include_in_project_meeting: "Project Meeting", include_in_vendor_meeting: "Vendor Meeting",
  resolved_at: "Resolved",
};

function VendorChangelogToggle({ entityType, entityId, orgId, people }: { entityType: string; entityId: string; orgId: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<{ id: string; action: string; field_name: string | null; old_value: string | null; new_value: string | null; performed_by: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  function load() {
    if (logs.length > 0 || loading) { setOpen(!open); return; }
    setOpen(true);
    setLoading(true);
    supabase
      .from("activity_log")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setLogs(data);
        setLoading(false);
      });
  }

  function personName(profileId: string | null) {
    if (!profileId) return "System";
    const person = people.find((p) => p.profile_id === profileId);
    return person?.full_name || "Unknown";
  }

  function formatLogTime(date: string) {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="border-t border-gray-200 bg-yellow-50/25">
      <button onClick={load} className="px-5 py-2 text-xs text-blue-600 hover:text-blue-800">
        👀 {open ? "Hide changelog" : "View changelog"}
      </button>
      {open && (
        <div className="px-5 pb-3">
          {loading ? (
            <div className="text-xs text-gray-400">Loading changelog...</div>
          ) : logs.length === 0 ? (
            <div className="text-xs text-gray-400">No changes recorded yet.</div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log) => {
                const fieldLabel = CHANGELOG_FIELD_LABELS[log.field_name || ""] || log.field_name || log.action;
                const who = personName(log.performed_by);
                const when = formatLogTime(log.created_at);

                if (log.action === "comment") {
                  return (
                    <div key={log.id} className="flex items-baseline gap-2 text-xs">
                      <span className="text-gray-400 flex-shrink-0 w-[110px]">{when}</span>
                      <span className="text-gray-600"><span className="font-medium text-gray-700">{who}</span> — Comment Made</span>
                    </div>
                  );
                }

                return (
                  <div key={log.id} className="flex items-baseline gap-2 text-xs">
                    <span className="text-gray-400 flex-shrink-0 w-[110px]">{when}</span>
                    <span className="text-gray-600">
                      <span className="font-medium text-gray-700">{who}</span> — {fieldLabel} Updated
                      {log.old_value && log.new_value ? <span className="text-gray-400"> ({log.old_value} → {log.new_value})</span> : log.new_value ? <span className="text-gray-400"> (→ {log.new_value})</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

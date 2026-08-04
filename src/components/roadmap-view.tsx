"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { priorityDot, priorityLabel, statusBadge, formatDateNumeric } from "@/lib/utils";
import type { ActionItem, RaidEntry, Person, Vendor, PriorityLevel, ItemStatus } from "@/lib/types";

type Entity = "action" | "issue" | "decision";
type Scale = "week" | "month" | "quarter" | "year";

interface RoadmapItem {
  id: string;
  entity: Entity;
  title: string;
  priority: PriorityLevel;
  status: ItemStatus;
  due_date: string | null;
  owner: Person | null;
}

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
  /** Due date written when a card is dropped here (end of the period). */
  target: Date;
}

const SCALES: { key: Scale; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

const BUCKET_COUNT: Record<Scale, number> = { week: 8, month: 6, quarter: 4, year: 3 };

const TYPE_META: Record<Entity, { label: string; cls: string }> = {
  action: { label: "Action", cls: "bg-blue-100 text-blue-700" },
  issue: { label: "Issue", cls: "bg-orange-100 text-orange-700" },
  decision: { label: "Decision", cls: "bg-purple-100 text-purple-700" },
};

const PRIORITY_RANK: Record<PriorityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const CLOSED_STATUSES = new Set(["complete", "closed", "rejected", "migrated_to_jira"]);

function parseLocal(d: string): Date {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd);
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekLabel(s: Date, e: Date): string {
  const sTxt = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const eTxt = e.toLocaleDateString(
    "en-US",
    s.getMonth() === e.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" }
  );
  return `${sTxt} – ${eTxt}`;
}

function makeBuckets(scale: Scale): Bucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: Bucket[] = [];
  const n = BUCKET_COUNT[scale];
  if (scale === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    for (let i = 0; i < n; i++) {
      const s = new Date(start);
      s.setDate(s.getDate() + i * 7);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      const target = new Date(s);
      target.setDate(target.getDate() + 4); // Friday = release day
      buckets.push({ key: `w-${toYMD(s)}`, label: weekLabel(s, e), start: s, end: e, target });
    }
  } else if (scale === "month") {
    for (let i = 0; i < n; i++) {
      const s = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const e = new Date(today.getFullYear(), today.getMonth() + i + 1, 0);
      buckets.push({
        key: `m-${toYMD(s)}`,
        label: s.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        start: s, end: e, target: e,
      });
    }
  } else if (scale === "quarter") {
    const q0 = Math.floor(today.getMonth() / 3);
    for (let i = 0; i < n; i++) {
      const s = new Date(today.getFullYear(), (q0 + i) * 3, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 3, 0);
      buckets.push({
        key: `q-${toYMD(s)}`,
        label: `Q${s.getMonth() / 3 + 1} ${s.getFullYear()}`,
        start: s, end: e, target: e,
      });
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = new Date(today.getFullYear() + i, 0, 1);
      const e = new Date(today.getFullYear() + i, 11, 31);
      buckets.push({ key: `y-${s.getFullYear()}`, label: String(s.getFullYear()), start: s, end: e, target: e });
    }
  }
  return buckets;
}

export default function RoadmapView({
  actions,
  raidEntries,
  onFieldSynced,
  onCountChange,
}: {
  actions: (ActionItem & { owner: Person | null; vendor: Vendor | null })[];
  raidEntries: (RaidEntry & { owner: Person | null; reporter: Person | null; vendor: Vendor | null })[];
  /** Push a saved field back to the Action Items / RAID tabs so their local state stays in sync. */
  onFieldSynced?: (entity: "action" | "raid", id: string, field: string, value: string) => void;
  onCountChange?: (n: number) => void;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<RoadmapItem[]>(() => {
    const fromActions: RoadmapItem[] = actions
      .filter((a) => !a.resolved_at && !CLOSED_STATUSES.has(a.status))
      .map((a) => ({ id: a.id, entity: "action", title: a.title, priority: a.priority, status: a.status, due_date: a.due_date, owner: a.owner }));
    const fromRaid: RoadmapItem[] = raidEntries
      .filter((r) => (r.raid_type === "issue" || r.raid_type === "decision") && !r.resolved_at && !CLOSED_STATUSES.has(r.status))
      .map((r) => ({ id: r.id, entity: r.raid_type as Entity, title: r.title, priority: r.priority, status: r.status, due_date: r.due_date, owner: r.owner }));
    return [...fromActions, ...fromRaid];
  });
  const [scale, setScale] = useState<Scale>("week");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  const buckets = useMemo(() => makeBuckets(scale), [scale]);
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

  // Partition items into columns
  const columns = useMemo(() => {
    const map: Record<string, RoadmapItem[]> = { unscheduled: [], overdue: [], later: [] };
    for (const b of buckets) map[b.key] = [];
    for (const it of items) {
      if (!it.due_date) { map.unscheduled.push(it); continue; }
      const d = parseLocal(it.due_date);
      if (d < today) { map.overdue.push(it); continue; }
      const bucket = buckets.find((b) => d >= b.start && d <= b.end);
      (bucket ? map[bucket.key] : map.later).push(it);
    }
    const rank = (it: RoadmapItem) => PRIORITY_RANK[it.priority];
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => rank(a) - rank(b) || (a.due_date || "9999").localeCompare(b.due_date || "9999") || a.title.localeCompare(b.title));
    }
    return map;
  }, [items, buckets, today]);

  async function schedule(itemId: string, newDate: string | null) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.due_date === newDate) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: newDate } : i)));
    const table = item.entity === "action" ? "action_items" : "raid_entries";
    const { data, error } = await supabase.from(table).update({ due_date: newDate }).eq("id", itemId).select("id");
    if (error || !data?.length) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: item.due_date } : i)));
      alert(error ? `Could not reschedule: ${error.message}` : "Could not reschedule — you may not have permission.");
      return;
    }
    onFieldSynced?.(item.entity === "action" ? "action" : "raid", itemId, "due_date", newDate || "");
  }

  function onColDrop(e: React.DragEvent, newDate: string | null) {
    e.preventDefault();
    setDropCol(null);
    if (dragId) schedule(dragId, newDate);
    setDragId(null);
  }

  function colDragProps(key: string, newDate: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropCol(key); },
      onDragLeave: (e: React.DragEvent) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related || !(e.currentTarget as HTMLElement).contains(related)) setDropCol((prev) => (prev === key ? null : prev));
      },
      onDrop: (e: React.DragEvent) => onColDrop(e, newDate),
    };
  }

  function renderCard(it: RoadmapItem) {
    const meta = TYPE_META[it.entity];
    const badge = statusBadge(it.status);
    const initials = it.owner?.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("");
    return (
      <div
        key={it.id}
        draggable
        onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setDropCol(null); }}
        className={`bg-white border border-gray-300 rounded-md p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 space-y-1.5 ${dragId === it.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${meta.cls}`}>{meta.label}</span>
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDot(it.priority)}`} title={priorityLabel(it.priority)} />
          {it.due_date && <span className="ml-auto text-[11px] text-gray-400">{formatDateNumeric(it.due_date)}</span>}
        </div>
        <div className="text-sm font-semibold text-gray-900 leading-snug">{it.title}</div>
        <div className="flex items-center gap-1.5">
          {it.owner ? (
            <>
              <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium flex items-center justify-center flex-shrink-0">{initials}</span>
              <span className="text-xs text-gray-500 truncate">{it.owner.full_name}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">Unassigned</span>
          )}
          <span className={`ml-auto inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${badge.className}`}>{badge.label}</span>
        </div>
      </div>
    );
  }

  function renderColumn(opts: { key: string; label: string; headerCls: string; items: RoadmapItem[]; newDate?: string | null; droppable: boolean; isCurrent?: boolean }) {
    const { key, label, headerCls, items: colItems, newDate, droppable, isCurrent } = opts;
    const isOver = dropCol === key && droppable;
    return (
      <div
        key={key}
        className={`w-64 flex-shrink-0 rounded-lg border flex flex-col transition-colors ${isOver ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-300"} bg-gray-50/60`}
        {...(droppable ? colDragProps(key, newDate ?? null) : {})}
      >
        <div className={`px-3 py-2 rounded-t-lg flex items-center justify-between ${headerCls} ${isCurrent ? "ring-2 ring-inset ring-blue-400" : ""}`}>
          <span className="text-xs font-semibold text-white uppercase tracking-wide truncate">{label}</span>
          <span className="text-xs text-gray-300 ml-2 flex-shrink-0">{colItems.length}</span>
        </div>
        <div className="p-2 space-y-2 flex-1 min-h-[140px]">
          {colItems.map(renderCard)}
          {colItems.length === 0 && (
            <p className={`text-xs px-1 py-2 ${isOver ? "text-blue-500 font-medium" : "text-gray-300"}`}>{isOver ? "Drop to schedule" : "—"}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Release Roadmap</h3>
        <div className="flex items-center gap-1">
          {SCALES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScale(s.key)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${scale === s.key ? "bg-white text-gray-900 font-medium" : "text-gray-300 hover:text-white hover:bg-gray-700"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400">No open action items, issues, or decisions in the queue.</p>
      ) : (
        <div className="p-3 overflow-x-auto">
          <div className="flex gap-3 items-stretch">
            {renderColumn({ key: "unscheduled", label: "Unscheduled", headerCls: "bg-gray-700", items: columns.unscheduled, newDate: null, droppable: true })}
            {columns.overdue.length > 0 &&
              renderColumn({ key: "overdue", label: "Overdue", headerCls: "bg-red-800", items: columns.overdue, droppable: false })}
            {buckets.map((b) =>
              renderColumn({
                key: b.key,
                label: b.label,
                headerCls: "bg-gray-800",
                items: columns[b.key],
                newDate: toYMD(b.target),
                droppable: true,
                isCurrent: today >= b.start && today <= b.end,
              })
            )}
            {columns.later.length > 0 &&
              renderColumn({ key: "later", label: "Later", headerCls: "bg-gray-700", items: columns.later, droppable: false })}
          </div>
        </div>
      )}
    </div>
  );
}

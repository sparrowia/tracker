"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { priorityDot, priorityLabel, statusBadge, formatDateNumeric, formatDate } from "@/lib/utils";
import type { RaidEntry, JiraTicket, Person, Vendor, PriorityLevel } from "@/lib/types";

type Entity = "decision" | "jira";
type Scale = "week" | "month" | "quarter" | "year";

interface RoadmapItem {
  id: string;
  entity: Entity;
  title: string;
  priority: PriorityLevel;
  statusLabel: string;
  statusClass: string;
  due_date: string | null;
  ownerName: string | null;
  description: string | null;
  jiraKey?: string;
  jiraUrl?: string | null;
  issueType?: string | null;
  releaseTarget?: string | null;
  epic?: string | null;
  labels?: string[];
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
  decision: { label: "Decision", cls: "bg-purple-100 text-purple-700" },
  jira: { label: "Jira", cls: "bg-sky-100 text-sky-700" },
};

const PRIORITY_RANK: Record<PriorityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const JIRA_PRIORITY_MAP: Record<string, PriorityLevel> = {
  Highest: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
  Lowest: "low",
};

function jiraStatusClass(category: string | null): string {
  switch (category) {
    case "done": return "text-green-700 bg-green-100";
    case "indeterminate": return "text-blue-700 bg-blue-100";
    default: return "text-gray-700 bg-gray-100";
  }
}

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

function decisionToItem(r: RaidEntry & { owner: Person | null }): RoadmapItem {
  const badge = statusBadge(r.status);
  return {
    id: r.id,
    entity: "decision",
    title: r.title,
    priority: r.priority,
    statusLabel: r.status === "complete" ? "Final" : badge.label,
    statusClass: badge.className,
    due_date: r.due_date,
    ownerName: r.owner?.full_name || null,
    description: r.description,
  };
}

function jiraToItem(t: JiraTicket): RoadmapItem {
  return {
    id: t.id,
    entity: "jira",
    title: t.summary,
    priority: JIRA_PRIORITY_MAP[t.jira_priority || ""] || "medium",
    statusLabel: t.status || "—",
    statusClass: jiraStatusClass(t.status_category),
    due_date: t.due_date,
    ownerName: t.assignee_name,
    description: null,
    jiraKey: t.jira_key,
    jiraUrl: t.jira_url,
    issueType: t.issue_type,
    releaseTarget: t.release_target,
    epic: t.epic,
    labels: t.labels,
  };
}

const CLOSED_DECISION = new Set(["complete", "closed", "rejected", "migrated_to_jira"]);

export default function RoadmapView({
  projectId,
  orgId,
  raidEntries,
  onFieldSynced,
  onCountChange,
}: {
  projectId: string;
  orgId: string;
  raidEntries: (RaidEntry & { owner: Person | null; reporter: Person | null; vendor: Vendor | null })[];
  /** Push a saved field back to the RAID tab so its local state stays in sync. */
  onFieldSynced?: (entity: "raid", id: string, field: string, value: string) => void;
  onCountChange?: (n: number) => void;
}) {
  const supabase = createClient();
  const { profileId } = useRole();
  const [items, setItems] = useState<RoadmapItem[]>(() =>
    raidEntries
      .filter((r) => r.raid_type === "decision" && !r.resolved_at && !CLOSED_DECISION.has(r.status))
      .map(decisionToItem)
  );
  const [scale, setScale] = useState<Scale>("week");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<RoadmapItem | null>(null);
  // entityKey -> {up, down, mine}
  const [votes, setVotes] = useState<Record<string, { up: number; down: number; mine: number | null }>>({});

  // Load imported Jira tickets + existing votes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: tickets, error } = await supabase
        .from("jira_tickets")
        .select("*")
        .eq("project_id", projectId)
        .order("jira_key");
      if (error) { console.error("jira_tickets load failed:", error.message); return; }
      if (cancelled || !tickets) return;
      const open = (tickets as JiraTicket[]).filter((t) => t.status_category !== "done");
      setItems((prev) => [...prev.filter((i) => i.entity !== "jira"), ...open.map(jiraToItem)]);

      const { data: voteRows } = await supabase.from("roadmap_votes").select("entity_type, entity_id, vote, profile_id");
      if (cancelled || !voteRows) return;
      const map: Record<string, { up: number; down: number; mine: number | null }> = {};
      for (const v of voteRows as { entity_type: string; entity_id: string; vote: number; profile_id: string }[]) {
        const k = `${v.entity_type}:${v.entity_id}`;
        map[k] = map[k] || { up: 0, down: 0, mine: null };
        if (v.vote > 0) map[k].up++; else map[k].down++;
        if (v.profile_id === profileId) map[k].mine = v.vote;
      }
      setVotes(map);
    })();
    return () => { cancelled = true; };
  }, [projectId, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  const buckets = useMemo(() => makeBuckets(scale), [scale]);
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

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

  function entityKey(it: RoadmapItem) {
    return `${it.entity === "decision" ? "raid_entry" : "jira_ticket"}:${it.id}`;
  }

  async function schedule(itemId: string, newDate: string | null) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.due_date === newDate) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: newDate } : i)));
    const table = item.entity === "decision" ? "raid_entries" : "jira_tickets";
    const { data, error } = await supabase.from(table).update({ due_date: newDate }).eq("id", itemId).select("id");
    if (error || !data?.length) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: item.due_date } : i)));
      alert(error ? `Could not reschedule: ${error.message}` : "Could not reschedule — you may not have permission.");
      return;
    }
    if (item.entity === "decision") onFieldSynced?.("raid", itemId, "due_date", newDate || "");
  }

  async function castVote(item: RoadmapItem, dir: 1 | -1) {
    if (!profileId) return;
    const k = entityKey(item);
    const cur = votes[k] || { up: 0, down: 0, mine: null };
    const entityType = item.entity === "decision" ? "raid_entry" : "jira_ticket";
    if (cur.mine === dir) {
      setVotes((prev) => ({ ...prev, [k]: { up: cur.up - (dir > 0 ? 1 : 0), down: cur.down - (dir < 0 ? 1 : 0), mine: null } }));
      supabase.from("roadmap_votes").delete().eq("profile_id", profileId).eq("entity_type", entityType).eq("entity_id", item.id).then(({ error }) => { if (error) console.error("vote delete failed:", error.message); });
    } else {
      setVotes((prev) => ({
        ...prev,
        [k]: {
          up: cur.up + (dir > 0 ? 1 : 0) - (cur.mine === 1 ? 1 : 0),
          down: cur.down + (dir < 0 ? 1 : 0) - (cur.mine === -1 ? 1 : 0),
          mine: dir,
        },
      }));
      supabase.from("roadmap_votes").upsert(
        { org_id: orgId, profile_id: profileId, entity_type: entityType, entity_id: item.id, vote: dir },
        { onConflict: "profile_id,entity_type,entity_id" }
      ).then(({ error }) => { if (error) console.error("vote save failed:", error.message); });
    }
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
    const initials = it.ownerName?.split(" ").map((w) => w[0]).slice(0, 2).join("");
    const v = votes[entityKey(it)];
    return (
      <div
        key={it.id}
        draggable
        onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setDropCol(null); }}
        className={`bg-white border border-gray-300 rounded-md p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 space-y-1.5 ${dragId === it.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${meta.cls}`}>
            {it.entity === "jira" ? it.jiraKey : meta.label}
          </span>
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDot(it.priority)}`} title={priorityLabel(it.priority)} />
          {it.due_date && <span className="text-[11px] text-gray-400">{formatDateNumeric(it.due_date)}</span>}
          <button
            draggable={false}
            onClick={(e) => { e.stopPropagation(); setViewItem(it); }}
            className="ml-auto text-gray-300 hover:text-blue-600 transition-colors"
            title="View details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div className="text-sm font-semibold text-gray-900 leading-snug">{it.title}</div>
        <div className="flex items-center gap-1.5">
          {it.ownerName ? (
            <>
              <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-medium flex items-center justify-center flex-shrink-0">{initials}</span>
              <span className="text-xs text-gray-500 truncate">{it.ownerName}</span>
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">Unassigned</span>
          )}
          {v && (v.up > 0 || v.down > 0) && (
            <span className="text-[10px] text-gray-400">👍{v.up > 0 ? v.up : ""}{v.down > 0 ? ` 👎${v.down}` : ""}</span>
          )}
          <span className={`ml-auto inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${it.statusClass}`}>{it.statusLabel}</span>
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

  const viewVotes = viewItem ? votes[entityKey(viewItem)] || { up: 0, down: 0, mine: null } : null;

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
        <p className="px-4 py-6 text-sm text-gray-400">No open decisions or Jira tickets in the queue.</p>
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

      {/* Detail modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${TYPE_META[viewItem.entity].cls}`}>
                  {viewItem.entity === "jira" ? viewItem.jiraKey : TYPE_META[viewItem.entity].label}
                </span>
                <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${viewItem.statusClass}`}>{viewItem.statusLabel}</span>
              </div>
              <button onClick={() => setViewItem(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">{viewItem.title}</h3>
              <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                <span className="text-gray-500">Priority</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${priorityDot(viewItem.priority)}`} />
                  {priorityLabel(viewItem.priority)}
                </span>
                <span className="text-gray-500">{viewItem.entity === "jira" ? "Assignee" : "Owner"}</span>
                <span>{viewItem.ownerName || <span className="text-gray-400 italic">Unassigned</span>}</span>
                <span className="text-gray-500">Due Date</span>
                <span>{viewItem.due_date ? formatDate(viewItem.due_date) : "—"}</span>
                {viewItem.entity === "jira" && (
                  <>
                    <span className="text-gray-500">Jira Type</span>
                    <span>{viewItem.issueType || "—"}</span>
                    <span className="text-gray-500">Release</span>
                    <span>{viewItem.releaseTarget || "—"}</span>
                    <span className="text-gray-500">Epic</span>
                    <span>{viewItem.epic || "—"}</span>
                    {viewItem.labels && viewItem.labels.length > 0 && (
                      <>
                        <span className="text-gray-500">Labels</span>
                        <span className="flex flex-wrap gap-1">
                          {viewItem.labels.map((l) => (
                            <span key={l} className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600">{l}</span>
                          ))}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              {viewItem.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewItem.description}</p>
                </div>
              )}
              {viewItem.jiraUrl && (
                <a href={viewItem.jiraUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
                  Open in Jira
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                </a>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
              <button
                onClick={() => castVote(viewItem, 1)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${viewVotes?.mine === 1 ? "border-green-400 bg-green-50 text-green-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                👍 {viewVotes?.up || 0}
              </button>
              <button
                onClick={() => castVote(viewItem, -1)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${viewVotes?.mine === -1 ? "border-red-400 bg-red-50 text-red-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
              >
                👎 {viewVotes?.down || 0}
              </button>
              <span className="ml-auto text-xs text-gray-400">Votes are one per person</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

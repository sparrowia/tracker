"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_UNIT_OPTIONS, BUSINESS_UNIT_LABEL } from "@/lib/business-units";
import { useRole } from "@/components/role-context";
import { priorityDot, priorityLabel, statusBadge, formatDateNumeric, formatDate } from "@/lib/utils";
import type { RaidEntry, JiraTicket, Person, Vendor, PriorityLevel, ItemStatus, RaidType, BusinessUnit } from "@/lib/types";

type Entity = "decision" | "issue" | "jira";
type Scale = "week" | "month" | "quarter" | "year";

interface RoadmapItem {
  id: string;
  entity: Entity;
  /** What the CARD shows. For Jira this is the plain-language label. */
  title: string;
  /** The full engineering summary, shown in the detail view. Only differs from
   *  `title` for Jira cards that have a plain-language label. */
  fullTitle?: string;
  priority: PriorityLevel;
  statusLabel: string;
  statusClass: string;
  due_date: string | null;
  ownerName: string | null;
  description: string | null;
  /** Actively being worked — shown in the In Progress column, not the time buckets. */
  inProgress: boolean;
  /** Tracker project the item belongs to (jira items use the host project). */
  projectId: string;
  /** Set only for items pulled in from other projects. */
  projectName?: string;
  projectSlug?: string;
  jiraKey?: string;
  jiraUrl?: string | null;
  issueType?: string | null;
  releaseTarget?: string | null;
  epic?: string | null;
  labels?: string[];
  hasPr?: boolean;
  prNumbers?: number[];
  businessUnit?: BusinessUnit | null;
}

const GITHUB_PR_BASE = "https://github.com/ed-cet/unified/pull/";

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
  issue: { label: "Issue", cls: "bg-orange-100 text-orange-700" },
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

const CLOSED_STATUSES = new Set<ItemStatus>(["complete", "closed", "rejected", "migrated_to_jira"]);

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

function raidToItem(
  r: Pick<RaidEntry, "id" | "title" | "priority" | "status" | "due_date" | "description" | "raid_type" | "business_unit">,
  ownerName: string | null,
  projectId: string,
  project?: { name: string; slug: string }
): RoadmapItem {
  const badge = statusBadge(r.status);
  return {
    id: r.id,
    entity: r.raid_type === "decision" ? "decision" : "issue",
    title: r.title,
    priority: r.priority,
    statusLabel: r.raid_type === "decision" && r.status === "complete" ? "Final" : badge.label,
    statusClass: badge.className,
    due_date: r.due_date,
    ownerName,
    description: r.description,
    inProgress: r.status === "in_progress" || r.status === "assessing",
    projectId,
    projectName: project?.name,
    projectSlug: project?.slug,
    businessUnit: r.business_unit,
  };
}

function jiraToItem(t: JiraTicket, hostProjectId: string): RoadmapItem {
  return {
    id: t.id,
    entity: "jira",
    // Cards read in plain language for a non-technical audience; the raw Jira
    // summary is still one click away in the detail modal. Falls back to the
    // Jira summary when a ticket has not been through the sync yet.
    title: t.plain_summary || t.summary,
    fullTitle: t.summary,
    priority: JIRA_PRIORITY_MAP[t.jira_priority || ""] || "medium",
    statusLabel: t.status || "—",
    statusClass: jiraStatusClass(t.status_category),
    due_date: t.due_date,
    ownerName: t.assignee_name,
    description: t.description,
    // A ticket with an associated PR counts as in progress even if its Jira
    // status hasn't moved yet (the Jira<->GitHub integration isn't connected).
    inProgress: t.status_category === "indeterminate" || t.has_pr,
    projectId: hostProjectId,
    jiraKey: t.jira_key,
    jiraUrl: t.jira_url,
    issueType: t.issue_type,
    releaseTarget: t.release_target,
    epic: t.epic,
    labels: t.labels,
    hasPr: t.has_pr,
    prNumbers: t.pr_numbers,
    businessUnit: t.business_unit,
  };
}

export default function RoadmapView({
  projectId,
  orgId,
  raidEntries,
  searchFilter = "",
  onFieldSynced,
  onCountChange,
}: {
  projectId: string;
  orgId: string;
  raidEntries: (RaidEntry & { owner: Person | null; reporter: Person | null; vendor: Vendor | null })[];
  searchFilter?: string;
  /** Push a saved field back to the RAID tab so its local state stays in sync. */
  onFieldSynced?: (entity: "raid", id: string, field: string, value: string) => void;
  onCountChange?: (n: number) => void;
}) {
  const supabase = createClient();
  const { profileId } = useRole();
  const storageKey = `roadmap-included-${projectId}`;
  const [items, setItems] = useState<RoadmapItem[]>(() =>
    raidEntries
      .filter((r) => r.raid_type === "decision" && !r.resolved_at && !CLOSED_STATUSES.has(r.status))
      .map((r) => raidToItem(r, r.owner?.full_name || null, projectId))
  );
  const [scale, setScale] = useState<Scale>("week");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<RoadmapItem | null>(null);
  // Set on dragstart and cleared by the click that follows a drag, so a
  // reschedule never also opens the modal.
  const draggedRef = useRef(false);
  // Source filter: tracker items (Issues + Decisions) vs Jira tickets. Persisted
  // so a chosen view survives a reload, like the scale and project pickers.
  const [source, setSource] = useState<"all" | "raid" | "jira">("all");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("roadmap-source-filter");
      if (saved === "all" || saved === "raid" || saved === "jira") setSource(saved);
    } catch { /* storage unavailable — default to all */ }
  }, []);
  function chooseSource(next: "all" | "raid" | "jira") {
    setSource(next);
    try { localStorage.setItem("roadmap-source-filter", next); } catch { /* ignore */ }
  }

  // Owning-team filter. A dropdown rather than checkboxes — looking at more than
  // one unit at a time is rare. "unassigned" is offered explicitly because most
  // rows start null and finding them is the point of triage.
  const [unit, setUnit] = useState<"all" | "unassigned" | BusinessUnit>("all");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("roadmap-unit-filter");
      if (saved && (saved === "all" || saved === "unassigned" || (BUSINESS_UNIT_OPTIONS as string[]).includes(saved))) {
        setUnit(saved as "all" | "unassigned" | BusinessUnit);
      }
    } catch { /* storage unavailable — default to all */ }
  }, []);
  function chooseUnit(next: "all" | "unassigned" | BusinessUnit) {
    setUnit(next);
    try { localStorage.setItem("roadmap-unit-filter", next); } catch { /* ignore */ }
  }

  // Assignee filter — same dropdown pattern as the unit filter. Values are the
  // owner/assignee display names, since Jira tickets carry only assignee_name
  // (no person id to join on).
  const [assignee, setAssignee] = useState<"all" | "unassigned" | string>("all");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("roadmap-assignee-filter");
      if (saved) setAssignee(saved);
    } catch { /* storage unavailable — default to all */ }
  }, []);
  function chooseAssignee(next: string) {
    setAssignee(next);
    try { localStorage.setItem("roadmap-assignee-filter", next); } catch { /* ignore */ }
  }

  // Status filter — dropdown over the status labels present on the loaded
  // items (Jira workflow statuses and tracker statuses alike).
  const [status, setStatus] = useState<"all" | string>("all");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("roadmap-status-filter");
      if (saved) setStatus(saved);
    } catch { /* storage unavailable — default to all */ }
  }, []);
  function chooseStatus(next: string) {
    setStatus(next);
    try { localStorage.setItem("roadmap-status-filter", next); } catch { /* ignore */ }
  }
  // entityKey -> {up, down, mine}
  const [votes, setVotes] = useState<Record<string, { up: number; down: number; mine: number | null }>>({});
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [includedProjects, setIncludedProjects] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]") as string[]; } catch { return []; }
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [ipCollapsed, setIpCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`roadmap-ip-collapsed-${projectId}`) === "1";
  });

  function toggleIpCollapsed() {
    setIpCollapsed((prev) => {
      try { localStorage.setItem(`roadmap-ip-collapsed-${projectId}`, prev ? "0" : "1"); } catch {}
      return !prev;
    });
  }

  // Grab-and-slide: press on board chrome (column headers, empty column space,
  // gaps) and drag to scroll the timeline horizontally. Presses on cards are
  // excluded so card drag-rescheduling keeps working, as are the interactive
  // controls.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  function onBoardMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[draggable="true"], button, select, input, a')) return;
    const el = scrollRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    setPanning(true);
    const onMove = (ev: MouseEvent) => { el.scrollLeft = startLeft - (ev.clientX - startX); ev.preventDefault(); };
    const onUp = () => {
      setPanning(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    // Stop a text selection from starting, which would fight the pan.
    e.preventDefault();
  }

  // Load imported Jira tickets + existing votes + project list for the picker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: tickets, error } = await supabase
        .from("jira_tickets")
        .select("*")
        .eq("project_id", projectId)
        .order("jira_key");
      if (error) console.error("jira_tickets load failed:", error.message);
      if (cancelled) return;
      if (tickets) {
        const open = (tickets as JiraTicket[]).filter((t) => t.status_category !== "done");
        setItems((prev) => [...prev.filter((i) => i.entity !== "jira"), ...open.map((t) => jiraToItem(t, projectId))]);
      }

      const { data: voteRows } = await supabase.from("roadmap_votes").select("entity_type, entity_id, vote, profile_id");
      if (cancelled) return;
      if (voteRows) {
        const map: Record<string, { up: number; down: number; mine: number | null }> = {};
        for (const v of voteRows as { entity_type: string; entity_id: string; vote: number; profile_id: string }[]) {
          const k = `${v.entity_type}:${v.entity_id}`;
          map[k] = map[k] || { up: 0, down: 0, mine: null };
          if (v.vote > 0) map[k].up++; else map[k].down++;
          if (v.profile_id === profileId) map[k].mine = v.vote;
        }
        setVotes(map);
      }

      const { data: projs } = await supabase.from("projects").select("id, name, slug").order("name");
      if (!cancelled && projs) setAllProjects(projs as { id: string; name: string; slug: string }[]);
    })();
    return () => { cancelled = true; };
  }, [projectId, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load open Decisions + Issues from the included projects (consolidated view)
  useEffect(() => {
    let cancelled = false;
    if (typeof window !== "undefined") {
      try { localStorage.setItem(storageKey, JSON.stringify(includedProjects)); } catch {}
    }
    (async () => {
      const foreign = includedProjects.filter((id) => id !== projectId);
      let next: RoadmapItem[] = [];
      if (foreign.length > 0) {
        const { data, error } = await supabase
          .from("raid_entries")
          .select("id, title, priority, status, due_date, description, raid_type, business_unit, project_id, resolved_at, owner:people!raid_entries_owner_id_fkey(id, full_name)")
          .in("project_id", foreign)
          .in("raid_type", ["issue", "decision"])
          .is("resolved_at", null);
        if (error) { console.error("cross-project load failed:", error.message); return; }
        const projMap = new Map(allProjects.map((p) => [p.id, p]));
        next = ((data || []) as unknown as (Pick<RaidEntry, "id" | "title" | "priority" | "status" | "due_date" | "description" | "project_id" | "business_unit"> & { raid_type: RaidType; owner: { full_name: string } | null })[])
          .filter((r) => !CLOSED_STATUSES.has(r.status))
          .map((r) => raidToItem(r, r.owner?.full_name || null, r.project_id!, projMap.get(r.project_id!)));
      }
      if (!cancelled) {
        setItems((prev) => [...prev.filter((i) => i.projectId === projectId), ...next]);
      }
    })();
    return () => { cancelled = true; };
  }, [includedProjects, allProjects, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the project picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  const buckets = useMemo(() => makeBuckets(scale), [scale]);
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);

  // Tab-bar Filter box applies here just like the other panels
  const visibleItems = useMemo(() => {
    const bySource =
      source === "all" ? items : items.filter((i) => (source === "jira" ? i.entity === "jira" : i.entity !== "jira"));
    const byUnit =
      unit === "all"
        ? bySource
        : bySource.filter((i) => (unit === "unassigned" ? !i.businessUnit : i.businessUnit === unit));
    const byAssignee =
      assignee === "all"
        ? byUnit
        : byUnit.filter((i) => (assignee === "unassigned" ? !i.ownerName : i.ownerName === assignee));
    const byStatus = status === "all" ? byAssignee : byAssignee.filter((i) => i.statusLabel === status);
    const q = searchFilter.trim().toLowerCase();
    if (!q) return byStatus;
    // Search the full engineering summary too, so a Jira key or technical term
    // still finds a card whose visible label is the plain-language one.
    return byStatus.filter((i) =>
      [i.title, i.fullTitle, i.jiraKey, i.ownerName, i.projectName, i.statusLabel, ...(i.labels || [])]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    );
  }, [items, searchFilter, source, unit, assignee, status]);

  // Names present on the loaded items, so the dropdown always matches the board.
  const assigneeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const i of items) if (i.ownerName) names.add(i.ownerName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const statusOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const i of items) if (i.statusLabel && i.statusLabel !== "—") labels.add(i.statusLabel);
    return [...labels].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const sourceCounts = useMemo(
    () => ({
      all: items.length,
      raid: items.filter((i) => i.entity !== "jira").length,
      jira: items.filter((i) => i.entity === "jira").length,
    }),
    [items]
  );

  const columns = useMemo(() => {
    const map: Record<string, RoadmapItem[]> = { inprogress: [], unscheduled: [], overdue: [], later: [] };
    for (const b of buckets) map[b.key] = [];
    for (const it of visibleItems) {
      if (it.inProgress) { map.inprogress.push(it); continue; }
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
  }, [visibleItems, buckets, today]);

  function entityKey(it: RoadmapItem) {
    return `${it.entity === "jira" ? "jira_ticket" : "raid_entry"}:${it.id}`;
  }

  async function schedule(itemId: string, newDate: string | null) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.due_date === newDate) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: newDate } : i)));
    const table = item.entity === "jira" ? "jira_tickets" : "raid_entries";
    const { data, error } = await supabase.from(table).update({ due_date: newDate }).eq("id", itemId).select("id");
    if (error || !data?.length) {
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, due_date: item.due_date } : i)));
      alert(error ? `Could not reschedule: ${error.message}` : "Could not reschedule — you may not have permission.");
      return;
    }
    if (item.entity !== "jira" && item.projectId === projectId) onFieldSynced?.("raid", itemId, "due_date", newDate || "");
  }

  // Owning team is the roadmap's OWN classification for Jira tickets (never
  // pushed to Jira) and a straight passthrough to the RAID column for tracker
  // items, so the Issues board and this view stay one value.
  async function saveBusinessUnit(item: RoadmapItem, next: BusinessUnit | null) {
    if ((item.businessUnit ?? null) === next) return;
    const prev = item.businessUnit ?? null;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, businessUnit: next } : i)));
    setViewItem((v) => (v && v.id === item.id ? { ...v, businessUnit: next } : v));
    const table = item.entity === "jira" ? "jira_tickets" : "raid_entries";
    const { data, error } = await supabase.from(table).update({ business_unit: next }).eq("id", item.id).select("id");
    if (error || !data?.length) {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, businessUnit: prev } : i)));
      setViewItem((v) => (v && v.id === item.id ? { ...v, businessUnit: prev } : v));
      alert(error ? `Could not set business unit: ${error.message}` : "Could not set business unit — you may not have permission.");
      return;
    }
    if (item.entity !== "jira" && item.projectId === projectId) onFieldSynced?.("raid", item.id, "business_unit", next || "");
  }

  async function castVote(item: RoadmapItem, dir: 1 | -1) {
    if (!profileId) return;
    const k = entityKey(item);
    const cur = votes[k] || { up: 0, down: 0, mine: null };
    const entityType = item.entity === "jira" ? "jira_ticket" : "raid_entry";
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
        onDragStart={(e) => { draggedRef.current = true; setDragId(it.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setDropCol(null); }}
        // Whole card is the hit target now that the eye icon is gone: a click
        // that starts and ends without a drag opens the detail modal, while
        // holding and moving grabs the card to reschedule. Most browsers
        // suppress click after a drag, but not all — draggedRef makes that
        // explicit rather than relying on it.
        onClick={() => {
          if (draggedRef.current) { draggedRef.current = false; return; }
          setViewItem(it);
        }}
        title="Click for details, or drag to reschedule"
        className={`bg-white border border-gray-300 rounded-md p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-400 space-y-1.5 ${dragId === it.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${meta.cls}`}>
            {it.entity === "jira" ? it.jiraKey : meta.label}
          </span>
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDot(it.priority)}`} title={priorityLabel(it.priority)} />
          {it.hasPr && (
            <span className="inline-flex px-1 py-0.5 text-[10px] font-medium rounded bg-emerald-100 text-emerald-700" title={`PR ${(it.prNumbers || []).map((n) => `#${n}`).join(", ")}`}>PR</span>
          )}
          {it.due_date && <span className="ml-auto text-[11px] text-gray-400">{formatDateNumeric(it.due_date)}</span>}

        </div>
        <div className="text-sm font-semibold text-gray-900 leading-snug">{it.title}</div>
        {it.projectName && <div className="text-[10px] font-medium text-indigo-500">{it.projectName}</div>}
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

  function renderColumn(opts: { key: string; label: string; headerCls: string; items: RoadmapItem[]; newDate?: string | null; droppable: boolean; isCurrent?: boolean; onCollapse?: () => void }) {
    const { key, label, headerCls, items: colItems, newDate, droppable, isCurrent, onCollapse } = opts;
    const isOver = dropCol === key && droppable;
    return (
      <div
        key={key}
        className={`w-64 flex-shrink-0 rounded-lg border flex flex-col transition-colors ${isOver ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-300"} bg-gray-50/60`}
        {...(droppable ? colDragProps(key, newDate ?? null) : {})}
      >
        <div className={`px-3 py-2 rounded-t-lg flex items-center justify-between ${headerCls} ${isCurrent ? "ring-2 ring-inset ring-blue-400" : ""}`}>
          <span className="text-xs font-semibold text-white uppercase tracking-wide truncate">{label}</span>
          <span className="text-xs text-gray-300 ml-2 flex-shrink-0 flex items-center gap-1.5">
            {colItems.length}
            {onCollapse && (
              <button onClick={onCollapse} className="text-gray-300 hover:text-white" title="Collapse">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
            )}
          </span>
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
  const otherProjects = allProjects.filter((p) => p.id !== projectId);
  const includedCount = includedProjects.filter((id) => id !== projectId).length;

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="bg-gray-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Release Roadmap</h3>
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((o) => !o)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${includedCount > 0 ? "border-blue-400 text-blue-300" : "border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700"}`}
            >
              + Projects{includedCount > 0 ? ` (${includedCount})` : ""}
            </button>
            {pickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-40 w-64 max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-md shadow-lg py-1">
                <p className="px-3 py-1.5 text-[11px] text-gray-400 border-b border-gray-200">Include open Decisions &amp; Issues from:</p>
                {otherProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includedProjects.includes(p.id)}
                      onChange={(e) =>
                        setIncludedProjects((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                ))}
                {otherProjects.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No other projects.</p>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded border border-gray-600 overflow-hidden mr-2">
            {([
              ["all", "All"],
              ["raid", "Issues"],
              ["jira", "Jira"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => chooseSource(key)}
                title={key === "raid" ? "Tracker Issues and Decisions only" : key === "jira" ? "Jira tickets only" : "Everything"}
                className={`px-2.5 py-1 text-xs transition-colors ${source === key ? "bg-white text-gray-900 font-medium" : "text-gray-300 hover:text-white hover:bg-gray-700"}`}
              >
                {label}
                {/* Count needs a different tone per state: gray-500 reads on the
                    selected button's white fill, but on the dark gray-800 header
                    it is ~2.6:1 and effectively invisible. */}
                <span className={`ml-1 ${source === key ? "text-gray-500" : "text-gray-400"}`}>{sourceCounts[key]}</span>
              </button>
            ))}
          </div>
          <select
            value={unit}
            onChange={(e) => chooseUnit(e.target.value as "all" | "unassigned" | BusinessUnit)}
            title="Filter by owning business unit"
            className={`mr-2 px-2 py-1 text-xs rounded border bg-gray-800 cursor-pointer focus:outline-none ${unit === "all" ? "border-gray-600 text-gray-300" : "border-blue-400 text-blue-300"}`}
          >
            <option value="all">All units</option>
            <option value="unassigned">Unassigned</option>
            {BUSINESS_UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{BUSINESS_UNIT_LABEL[u]}</option>
            ))}
          </select>
          <select
            value={assignee}
            onChange={(e) => chooseAssignee(e.target.value)}
            title="Filter by assignee"
            className={`mr-2 px-2 py-1 text-xs rounded border bg-gray-800 cursor-pointer focus:outline-none ${assignee === "all" ? "border-gray-600 text-gray-300" : "border-blue-400 text-blue-300"}`}
          >
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {/* Keep a saved name selectable even if no loaded item carries it,
                so the control doesn't render blank on a stale filter. */}
            {assignee !== "all" && assignee !== "unassigned" && !assigneeOptions.includes(assignee) && (
              <option value={assignee}>{assignee}</option>
            )}
            {assigneeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => chooseStatus(e.target.value)}
            title="Filter by status"
            className={`mr-2 px-2 py-1 text-xs rounded border bg-gray-800 cursor-pointer focus:outline-none ${status === "all" ? "border-gray-600 text-gray-300" : "border-blue-400 text-blue-300"}`}
          >
            <option value="all">All statuses</option>
            {/* Keep a saved status selectable even if no loaded item carries it,
                so the control doesn't render blank on a stale filter. */}
            {status !== "all" && !statusOptions.includes(status) && (
              <option value={status}>{status}</option>
            )}
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {/* Dropdown rather than four buttons to keep the header compact. */}
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as Scale)}
            title="Time period"
            className="px-2 py-1 text-xs rounded border border-gray-600 bg-gray-800 text-gray-300 cursor-pointer focus:outline-none"
          >
            {SCALES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {visibleItems.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400">
          {searchFilter.trim() ? "No roadmap items match the filter." : "No open decisions or Jira tickets in the queue."}
        </p>
      ) : (
        <div
          ref={scrollRef}
          onMouseDown={onBoardMouseDown}
          className={`p-3 overflow-x-auto ${panning ? "cursor-grabbing select-none" : "cursor-grab"}`}
        >
          <div className="flex gap-3 items-stretch">
            {renderColumn({ key: "unscheduled", label: "Unscheduled", headerCls: "bg-gray-700", items: columns.unscheduled, newDate: null, droppable: true })}
            {ipCollapsed ? (
              <button
                onClick={toggleIpCollapsed}
                className="flex-shrink-0 w-9 rounded-lg border border-gray-300 bg-gray-50/60 hover:border-blue-400 flex flex-col items-center gap-2 py-2.5 transition-colors"
                title="Expand In Progress"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="m9 18 6-6-6-6"/></svg>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500" style={{ writingMode: "vertical-rl" }}>
                  In Progress ({columns.inprogress.length})
                </span>
              </button>
            ) : (
              renderColumn({ key: "inprogress", label: "In Progress", headerCls: "bg-blue-800", items: columns.inprogress, droppable: false, onCollapse: toggleIpCollapsed })
            )}
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
              {viewItem.fullTitle && viewItem.fullTitle !== viewItem.title && (
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide -mb-2">{viewItem.title}</p>
              )}
              <h3 className="text-sm font-semibold text-gray-900">{viewItem.fullTitle || viewItem.title}</h3>
              <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                {viewItem.projectName && (
                  <>
                    <span className="text-gray-500">Project</span>
                    <span>{viewItem.projectName}</span>
                  </>
                )}
                <span className="text-gray-500">Priority</span>
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${priorityDot(viewItem.priority)}`} />
                  {priorityLabel(viewItem.priority)}
                </span>
                <span className="text-gray-500">{viewItem.entity === "jira" ? "Assignee" : "Owner"}</span>
                <span>{viewItem.ownerName || <span className="text-gray-400 italic">Unassigned</span>}</span>
                <span className="text-gray-500">Due Date</span>
                <span>{viewItem.due_date ? formatDate(viewItem.due_date) : "—"}</span>
                {/* Editable in the popup for BOTH sources, so the unit can be set
                    here without going back to the Issues board. */}
                <span className="text-gray-500">Business Unit</span>
                <span>
                  {/* No client-side permission gate, matching schedule() above:
                      RLS is the authority and saveBusinessUnit rolls the
                      optimistic update back if the write is refused. Vendors
                      never reach here — RLS excludes them from SELECT. */}
                  <select
                    value={viewItem.businessUnit || ""}
                    onChange={(e) => saveBusinessUnit(viewItem, (e.target.value || null) as BusinessUnit | null)}
                    className="text-sm rounded border border-gray-300 bg-white py-0.5 px-1 cursor-pointer focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {BUSINESS_UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{BUSINESS_UNIT_LABEL[u]}</option>
                    ))}
                  </select>
                </span>
                {viewItem.entity === "jira" && (
                  <>
                    <span className="text-gray-500">Jira Type</span>
                    <span>{viewItem.issueType || "—"}</span>
                    <span className="text-gray-500">Release</span>
                    <span>{viewItem.releaseTarget || "—"}</span>
                    <span className="text-gray-500">Epic</span>
                    <span>{viewItem.epic || "—"}</span>
                    {viewItem.prNumbers && viewItem.prNumbers.length > 0 && (
                      <>
                        <span className="text-gray-500">Pull Requests</span>
                        <span className="flex flex-wrap gap-2">
                          {viewItem.prNumbers.map((n) => (
                            <a key={n} href={`${GITHUB_PR_BASE}${n}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">#{n}</a>
                          ))}
                        </span>
                      </>
                    )}
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
              {viewItem.projectSlug && (
                <a
                  href={`/projects/${viewItem.projectSlug}?tab=raid&item=${viewItem.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                >
                  Open in {viewItem.projectName}
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

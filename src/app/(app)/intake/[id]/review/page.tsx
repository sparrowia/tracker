"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { priorityColor, priorityLabel, statusBadge } from "@/lib/utils";
import type { Intake, PriorityLevel, ItemStatus, Vendor, Project, Person } from "@/lib/types";
import { useRole } from "@/components/role-context";

interface MatchCandidate {
  table: "action_items" | "blockers" | "raid_entries";
  id: string;
  title: string;
  status: string;
  priority: string;
  raid_type?: string;
  project_name?: string;
  confidence: "high" | "medium";
  reason: string;
}

interface ExtractedItem {
  title: string;
  owner_name?: string | null;
  priority?: PriorityLevel;
  due_date?: string | null;
  notes?: string | null;
  impact?: string | null;
  impact_description?: string | null;
  rationale?: string | null;
  made_by?: string | null;
  decision_date?: string | null;
  mitigation?: string | null;
  new_status?: string | null;
  details?: string | null;
  subject?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  source_quote?: string | null;
  date_reported?: string | null;
  attachments?: string | null;
  updates?: string | null;
  reporter_name?: string | null;
  status?: string | null;
  // Per-item overrides
  _accepted?: boolean;
  _edited?: boolean;
  _editing?: boolean;
  _project_id?: string | null;
  _vendor_id?: string | null;
  _linked_to?: MatchCandidate | null;
  _link_action?: "update" | "replace" | "child";
  _save_as?: EntityCategory;
}

type EntityCategory = "action_items" | "decisions" | "issues" | "risks" | "blockers" | "status_updates";

const categoryLabels: Record<EntityCategory, string> = {
  action_items: "Action Items",
  decisions: "Decisions",
  issues: "Issues",
  risks: "Risks",
  blockers: "Blockers",
  status_updates: "Status Updates",
};

/** Simple Levenshtein distance for fuzzy name matching */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

const categoryColors: Record<EntityCategory, string> = {
  action_items: "border-blue-200 bg-blue-50",
  decisions: "border-purple-200 bg-purple-50",
  issues: "border-orange-200 bg-orange-50",
  risks: "border-yellow-200 bg-yellow-50",
  blockers: "border-red-200 bg-red-50",
  status_updates: "border-gray-200 bg-gray-50",
};

const reassignableCategories: EntityCategory[] = ["action_items", "decisions", "issues", "risks", "blockers"];

const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];
const statusOptions = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];

// Which fields to show per category
const categoryFields: Record<EntityCategory, { field: string; label: string; type: "text" | "select" | "date" | "textarea" | "person" }[]> = {
  action_items: [
    { field: "title", label: "Title", type: "text" },
    { field: "owner_name", label: "Owner", type: "person" },
    { field: "priority", label: "Priority", type: "select" },
    { field: "due_date", label: "Due Date", type: "date" },
    { field: "notes", label: "Notes", type: "textarea" },
  ],
  decisions: [
    { field: "title", label: "Decision", type: "text" },
    { field: "made_by", label: "Made By", type: "person" },
    { field: "decision_date", label: "Date", type: "date" },
    { field: "rationale", label: "Rationale", type: "textarea" },
  ],
  issues: [
    { field: "title", label: "Issue", type: "text" },
    { field: "owner_name", label: "Owner", type: "person" },
    { field: "reporter_name", label: "Reporter", type: "person" },
    { field: "priority", label: "Priority", type: "select" },
    { field: "date_reported", label: "Date Reported", type: "date" },
    { field: "impact", label: "Impact", type: "textarea" },
    { field: "attachments", label: "Screenshots/Videos", type: "textarea" },
    { field: "notes", label: "Notes", type: "textarea" },
    { field: "updates", label: "Updates", type: "textarea" },
  ],
  risks: [
    { field: "title", label: "Risk", type: "text" },
    { field: "priority", label: "Priority", type: "select" },
    { field: "impact", label: "Impact", type: "textarea" },
    { field: "mitigation", label: "Mitigation", type: "textarea" },
  ],
  blockers: [
    { field: "title", label: "Blocker", type: "text" },
    { field: "owner_name", label: "Owner", type: "person" },
    { field: "priority", label: "Priority", type: "select" },
    { field: "impact_description", label: "Impact", type: "textarea" },
  ],
  status_updates: [
    { field: "subject", label: "Subject", type: "text" },
    { field: "new_status", label: "Status", type: "select" },
    { field: "details", label: "Details", type: "textarea" },
  ],
};

function renderHighlightedText(text: string, quote: string) {
  const lowerText = text.toLowerCase();
  const lowerQuote = quote.toLowerCase().trim();

  // First try exact substring match (case-insensitive)
  let idx = lowerText.indexOf(lowerQuote);
  let matchLength = lowerQuote.length;

  // If no exact match, try flexible whitespace matching via regex
  if (idx === -1) {
    const escaped = lowerQuote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flexPattern = escaped.replace(/\\?\s+/g, "\\s+");
    try {
      const regex = new RegExp(flexPattern, "i");
      const result = regex.exec(text);
      if (result && result.index !== undefined) {
        idx = result.index;
        matchLength = result[0].length;
      }
    } catch {
      // regex failed, fall through
    }
  }

  if (idx === -1) return <>{text}</>;

  const before = text.substring(0, idx);
  const match = text.substring(idx, idx + matchLength);
  const after = text.substring(idx + matchLength);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

export default function IntakeReviewPage() {
  const { profileId, orgId } = useRole();
  const params = useParams();
  const intakeId = params.id as string;
  const [intake, setIntake] = useState<Intake | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [extracted, setExtracted] = useState<Record<EntityCategory, ExtractedItem[]>>({
    action_items: [],
    decisions: [],
    issues: [],
    risks: [],
    blockers: [],
    status_updates: [],
  });
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<Record<string, MatchCandidate[]>>({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [dismissedMatches, setDismissedMatches] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<EntityCategory | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MatchCandidate[]>([]);
  const [searchOpen, setSearchOpen] = useState<string | false>(false);
  const [searching, setSearching] = useState(false);

  // Set initial tab when extracted data changes
  useEffect(() => {
    if (activeTab !== null) return;
    const cats = (Object.entries(extracted) as [EntityCategory, ExtractedItem[]][])
      .filter(([, items]) => items.length > 0)
      .map(([cat]) => cat);
    if (cats.length > 0) {
      setActiveTab(cats[0]);
    }
  }, [extracted, activeTab]);

  // Clamp activeIndex when tab or items change
  useEffect(() => {
    const items = activeTab ? extracted[activeTab] : [];
    if (activeIndex >= items.length && items.length > 0) {
      setActiveIndex(items.length - 1);
    }
  }, [activeTab, extracted, activeIndex]);

  // Keyboard shortcuts for fast triage
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs/textareas/selects
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!activeTab) return;
      const items = extracted[activeTab];
      if (!items || items.length === 0) return;
      const item = items[activeIndex];
      if (!item) return;

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          if (activeIndex > 0) setActiveIndex(activeIndex - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (activeIndex < items.length - 1) setActiveIndex(activeIndex + 1);
          break;
        case "a":
        case "A":
          e.preventDefault();
          acceptItem(activeTab, activeIndex, true);
          break;
        case "x":
        case "X":
          e.preventDefault();
          rejectItem(activeTab, activeIndex, true);
          break;
        case "e":
        case "E":
          e.preventDefault();
          if (!item._editing) startEdit(activeTab, activeIndex);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, activeIndex, extracted]);

  const rawTextRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSnapshotsRef = useRef<Map<string, ExtractedItem>>(new Map());
  const originalExtractedRef = useRef<Record<EntityCategory, ExtractedItem[]> | null>(null);
  const extractedContactsRef = useRef<{ full_name?: string; title?: string | null; email?: string | null; phone?: string | null }[]>([]);
  const router = useRouter();
  const supabase = createClient();

  const scrollToSource = useCallback((quote: string | null | undefined) => {
    if (!quote || !rawTextRef.current || !intake) return;

    // Clear any existing auto-clear timer
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    // Force a re-render even if the same quote is clicked again
    setHighlightedQuote(null);
    // Use a microtask to ensure the null render happens first
    queueMicrotask(() => {
      setHighlightedQuote(quote);

      // After React renders with the highlight, scroll to the <mark> element
      setTimeout(() => {
        const mark = rawTextRef.current?.querySelector("mark");
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);

      // Auto-clear highlight after 4 seconds
      highlightTimerRef.current = setTimeout(() => setHighlightedQuote(null), 4000);
    });
  }, [intake]);

  useEffect(() => {
    async function loadData() {
      const [{ data: intakeData, error: intakeErr }, { data: v }, { data: p }, { data: ppl }] =
        await Promise.all([
          supabase.from("intakes").select("*").eq("id", intakeId).single(),
          supabase.from("vendors").select("*").order("name"),
          supabase.from("projects").select("*").order("name"),
          supabase.from("people").select("*").order("full_name"),
        ]);

      if (intakeErr || !intakeData) {
        setError("Intake not found");
        setLoading(false);
        return;
      }

      setIntake(intakeData as Intake);
      setVendors((v || []) as Vendor[]);
      setProjects((p || []) as Project[]);
      setPeople((ppl || []) as Person[]);

      if (intakeData.extracted_data) {
        const ed = intakeData.extracted_data as Record<string, ExtractedItem[]>;
        const defaultProjectId = intakeData.project_id || null;
        const defaultVendorId = intakeData.vendor_id || null;

        // Store original AI output for correction logging
        originalExtractedRef.current = {
          action_items: ed.action_items || [],
          decisions: ed.decisions || [],
          issues: ed.issues || [],
          risks: ed.risks || [],
          blockers: ed.blockers || [],
          status_updates: ed.status_updates || [],
        };

        // Sort items by confidence: low first (needs most review), then medium, then high
        const confidenceRank = { low: 0, medium: 1, high: 2 };
        function sortByConfidence(items: ExtractedItem[]): ExtractedItem[] {
          return [...items].sort((a, b) =>
            (confidenceRank[a.confidence || "high"] ?? 2) - (confidenceRank[b.confidence || "high"] ?? 2)
          );
        }
        function prepItems(items: ExtractedItem[]): ExtractedItem[] {
          return sortByConfidence(items).map((i) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          }));
        }

        setExtracted({
          action_items: prepItems(ed.action_items || []),
          decisions: prepItems(ed.decisions || []),
          issues: prepItems(ed.issues || []),
          risks: prepItems(ed.risks || []),
          blockers: prepItems(ed.blockers || []),
          status_updates: prepItems(ed.status_updates || []),
        });
        extractedContactsRef.current = ed.contacts || [];
      }

      setLoading(false);

      // Fetch matches (non-blocking — UI is already visible)
      if (intakeData.extracted_data) {
        setMatchLoading(true);
        try {
          const matchRes = await fetch("/api/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intake_id: intakeId,
              vendor_id: intakeData.vendor_id || null,
              project_id: intakeData.project_id || null,
            }),
          });
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            const raw = matchData.matches || {};
            // Convert API shape to MatchCandidate[]
            const converted: Record<string, MatchCandidate[]> = {};
            for (const [key, candidates] of Object.entries(raw)) {
              converted[key] = (candidates as { existing_id: string; existing_table: string; title: string; status: string; priority: string; raid_type?: string; project_name?: string; confidence: "high" | "medium"; reason: string }[]).map((c) => ({
                table: c.existing_table as MatchCandidate["table"],
                id: c.existing_id,
                title: c.title,
                status: c.status,
                priority: c.priority,
                raid_type: c.raid_type,
                project_name: c.project_name,
                confidence: c.confidence,
                reason: c.reason,
              }));
            }
            setMatchResults(converted);
          }
        } catch {
          // Matching is optional — silently fail
        } finally {
          setMatchLoading(false);
        }
      }
    }
    loadData();
  }, [intakeId]);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function acceptItem(category: EntityCategory, index: number, autoAdvance = false) {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _accepted: item._accepted === true ? undefined : true } : item
      ),
    }));
    if (autoAdvance) {
      const items = extracted[category];
      if (index < items.length - 1) {
        advanceTimerRef.current = setTimeout(() => setActiveIndex(index + 1), 400);
      }
    }
  }

  function rejectItem(category: EntityCategory, index: number, autoAdvance = false) {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _accepted: item._accepted === false ? undefined : false } : item
      ),
    }));
    if (autoAdvance) {
      const items = extracted[category];
      if (index < items.length - 1) {
        advanceTimerRef.current = setTimeout(() => setActiveIndex(index + 1), 400);
      }
    }
  }

  function acceptAllInCategory(category: EntityCategory) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item) =>
        item._accepted === false ? item : { ...item, _accepted: true }
      ),
    }));
  }

  function startEdit(category: EntityCategory, index: number) {
    const key = `${category}-${index}`;
    const item = extracted[category][index];
    editSnapshotsRef.current.set(key, { ...item });
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((it, i) =>
        i === index ? { ...it, _editing: true } : it
      ),
    }));
  }

  function cancelEdit(category: EntityCategory, index: number) {
    const key = `${category}-${index}`;
    const snapshot = editSnapshotsRef.current.get(key);
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((it, i) =>
        i === index ? (snapshot ? { ...snapshot, _editing: false } : { ...it, _editing: false }) : it
      ),
    }));
    editSnapshotsRef.current.delete(key);
  }

  async function saveEdit(category: EntityCategory, index: number) {
    const key = `${category}-${index}`;
    editSnapshotsRef.current.delete(key);

    const item = extracted[category][index];

    // Check if any person fields have new names not in the people list
    const personFields = categoryFields[category].filter((f) => f.type === "person");
    for (const pf of personFields) {
      const name = (item as unknown as Record<string, unknown>)[pf.field] as string | null;
      if (name && name.trim() && !people.some((p) => p.full_name === name.trim())) {
        // Create the person in Supabase
        if (orgId) {
          const { data: newPerson } = await supabase
            .from("people")
            .insert({ full_name: name.trim(), org_id: orgId, is_internal: false, created_by: profileId })
            .select("*")
            .single();
          if (newPerson) {
            setPeople((prev) => [...prev, newPerson as Person].sort((a, b) => a.full_name.localeCompare(b.full_name)));
          }
        }
      }
    }

    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((it, i) =>
        i === index ? { ...it, _editing: false } : it
      ),
    }));
  }

  function updateItem(category: EntityCategory, index: number, field: string, value: string) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, [field]: value, _edited: true } : item
      ),
    }));
  }

  function linkItem(category: EntityCategory, index: number, candidate: MatchCandidate, action: "update" | "replace" | "child") {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _linked_to: candidate, _link_action: action, _accepted: true } : item
      ),
    }));
  }

  function unlinkItem(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _linked_to: null, _link_action: undefined } : item
      ),
    }));
  }

  async function searchExistingItems(query: string) {
    if (!query.trim() || !orgId) return;
    setSearching(true);
    const q = query.trim().toLowerCase();
    const results: MatchCandidate[] = [];

    // Search action_items, blockers, raid_entries by title (case-insensitive)
    const [{ data: actions }, { data: blockers }, { data: raids }] = await Promise.all([
      supabase.from("action_items").select("id, title, status, priority, project:projects(name)").eq("org_id", orgId).ilike("title", `%${q}%`).limit(10),
      supabase.from("blockers").select("id, title, status, priority, project:projects(name)").eq("org_id", orgId).ilike("title", `%${q}%`).limit(10),
      supabase.from("raid_entries").select("id, title, status, priority, raid_type, project:projects(name)").eq("org_id", orgId).ilike("title", `%${q}%`).limit(10),
    ]);

    for (const a of (actions || [])) {
      const pn = Array.isArray(a.project) ? a.project[0]?.name : (a.project as { name: string } | null)?.name;
      results.push({ table: "action_items", id: a.id, title: a.title, status: a.status, priority: a.priority, confidence: "high", reason: "manual search", project_name: pn || undefined });
    }
    for (const b of (blockers || [])) {
      const pn = Array.isArray(b.project) ? b.project[0]?.name : (b.project as { name: string } | null)?.name;
      results.push({ table: "blockers", id: b.id, title: b.title, status: b.status, priority: b.priority, confidence: "high", reason: "manual search", project_name: pn || undefined });
    }
    for (const r of (raids || [])) {
      const pn = Array.isArray(r.project) ? r.project[0]?.name : (r.project as { name: string } | null)?.name;
      results.push({ table: "raid_entries", id: r.id, title: r.title, status: r.status, priority: r.priority, raid_type: r.raid_type, confidence: "high", reason: "manual search", project_name: pn || undefined });
    }

    setSearchResults(results);
    setSearching(false);
  }

  function dismissMatch(category: EntityCategory, index: number, existingId: string) {
    setDismissedMatches((prev) => new Set([...prev, `${category}-${index}-${existingId}`]));
    // Log match dismissal for feedback loop (fire-and-forget)
    const item = extracted[category]?.[index];
    if (item && intake && orgId) {
      supabase.from("correction_log").insert({
        org_id: orgId,
        intake_id: intake.id,
        extracted_category: category,
        extracted_title: item.title || item.subject || "",
        extracted_priority: item.priority || null,
        correction_type: "match_dismissed",
        corrected_value: existingId,
      });
    }
  }

  async function handleConfirm() {
    if (!intake) return;
    setConfirming(true);
    setError(null);

    try {
      if (!orgId) throw new Error("No org found");

      // Get people for fuzzy matching owner names (include contact fields for update detection)
      const { data: existingPeople } = await supabase
        .from("people")
        .select("id, full_name, title, email, phone")
        .eq("org_id", orgId);

      const peopleList = (existingPeople || []) as { id: string; full_name: string; title: string | null; email: string | null; phone: string | null }[];
      const peopleMap = new Map(
        peopleList.map((p) => [p.full_name.toLowerCase(), p.id])
      );

      // Collect all owner names from accepted items that need person records
      const allOwnerNames = new Set<string>();
      for (const [cat, items] of Object.entries(extracted)) {
        for (const item of items) {
          const name = cat === "decisions" ? item.made_by : item.owner_name;
          if (name && name.trim()) allOwnerNames.add(name.trim());
        }
      }

      // Fuzzy person matching: check exact, substring, first/last name, and Levenshtein distance
      function fuzzyFindPerson(name: string): string | null {
        const lower = name.toLowerCase();
        if (peopleMap.has(lower)) return peopleMap.get(lower)!;
        // Substring / contains match
        for (const [fullName, id] of peopleMap) {
          if (fullName.includes(lower) || lower.includes(fullName)) return id;
        }
        // First or last name match
        const inputParts = lower.split(/\s+/);
        for (const [fullName, id] of peopleMap) {
          const existingParts = fullName.split(/\s+/);
          // Any input part matches any existing part (first name, last name)
          if (inputParts.some((ip) => existingParts.some((ep) => ep === ip))) return id;
        }
        // Levenshtein distance ≤ 2 on full name (catches typos like "Jon" vs "John")
        for (const [fullName, id] of peopleMap) {
          if (levenshtein(lower, fullName) <= 2) return id;
          // Also check individual parts for close matches
          const existingParts = fullName.split(/\s+/);
          if (inputParts.some((ip) => existingParts.some((ep) => levenshtein(ip, ep) <= 1))) return id;
        }
        return null;
      }

      // Create missing people (only if no fuzzy match found)
      for (const name of allOwnerNames) {
        const match = fuzzyFindPerson(name);
        if (!match) {
          const { data: newPerson, error: personErr } = await supabase
            .from("people")
            .insert({ full_name: name, org_id: orgId, is_internal: false, created_by: profileId })
            .select("id, full_name")
            .single();
          if (personErr) throw new Error(`Failed to create person "${name}": ${personErr.message}`);
          if (newPerson) {
            peopleMap.set(newPerson.full_name.toLowerCase(), newPerson.id);
          }
        }
      }

      // Update contact info from AI-extracted contacts
      const extractedContacts = extractedContactsRef.current;
      for (const contact of extractedContacts) {
        if (!contact.full_name) continue;
        const personId = fuzzyFindPerson(contact.full_name);
        if (!personId) continue;
        const existing = peopleList.find((p) => p.id === personId);
        if (!existing) continue;
        const updates: Record<string, string> = {};
        if (contact.title && !existing.title) updates.title = contact.title;
        if (contact.email && !existing.email) updates.email = contact.email;
        if (contact.phone && !existing.phone) updates.phone = contact.phone;
        if (Object.keys(updates).length > 0) {
          supabase.from("people").update(updates).eq("id", personId).then(() => {});
        }
      }

      function findPersonId(name: string | null | undefined): string | null {
        if (!name) return null;
        return fuzzyFindPerson(name.trim());
      }

      // Collect all accepted new items, grouped by effective type
      const byEffectiveType: Record<EntityCategory, ExtractedItem[]> = {
        action_items: [], decisions: [], issues: [], risks: [], blockers: [], status_updates: [],
      };
      // Linked items — action determined by _link_action
      const linkedItems: { item: ExtractedItem; cat: EntityCategory; linkedTo: MatchCandidate; action: "update" | "replace" | "child" }[] = [];
      for (const [cat, items] of Object.entries(extracted) as [EntityCategory, ExtractedItem[]][]) {
        for (const item of items) {
          if (item._accepted !== true) continue;
          if (item._linked_to) {
            linkedItems.push({ item, cat, linkedTo: item._linked_to, action: item._link_action || "child" });
            continue;
          }
          const effectiveType = item._save_as || cat;
          byEffectiveType[effectiveType].push(item);
        }
      }

      // Batch insert with rollback tracking: collect created IDs so we can clean up on failure
      const createdIds: { table: string; ids: string[] }[] = [];

      async function batchInsert(table: string, rows: Record<string, unknown>[]) {
        if (rows.length === 0) return;
        const { data, error: err } = await supabase.from(table).insert(rows).select("id");
        if (err) throw new Error(`${table}: ${err.message}`);
        if (data) createdIds.push({ table, ids: data.map((r: { id: string }) => r.id) });
      }

      async function rollbackCreated() {
        for (const { table, ids } of createdIds) {
          if (ids.length > 0) {
            await supabase.from(table).delete().in("id", ids);
          }
        }
      }

      try {
        const today = new Date().toISOString().split("T")[0];
        console.log("[Confirm] Inserting items:", Object.fromEntries(
          Object.entries(byEffectiveType).map(([k, v]) => [k, v.length])
        ));

        // Create action items
        await batchInsert("action_items",
          byEffectiveType.action_items.map((item) => ({
            org_id: orgId,
            title: item.title || item.subject,
            owner_id: findPersonId(item.owner_name),
            vendor_id: item._vendor_id || null,
            project_id: item._project_id || null,
            priority: item.priority || "medium",
            status: item.status || "pending",
            due_date: item.due_date || null,
            first_flagged_at: today,
            notes: item.notes || item.details || item.rationale || item.impact_description || null,
            created_by: profileId,
          }))
        );

        // Create decisions as RAID entries
        if (byEffectiveType.decisions.length > 0) {
          const { count } = await supabase
            .from("raid_entries")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("raid_type", "decision");

          await batchInsert("raid_entries",
            byEffectiveType.decisions.map((item, idx) => ({
              org_id: orgId,
              raid_type: "decision" as const,
              display_id: `D${(count || 0) + idx + 1}`,
              title: item.title || item.subject,
              description: item.rationale || item.notes || item.details || null,
              owner_id: findPersonId(item.made_by || item.owner_name),
              project_id: item._project_id || null,
              decision_date: item.decision_date || null,
              first_flagged_at: item.decision_date || today,
              priority: "medium" as const,
              created_by: profileId,
            }))
          );
        }

        // Create issues as RAID entries
        if (byEffectiveType.issues.length > 0) {
          const { count } = await supabase
            .from("raid_entries")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("raid_type", "issue");

          await batchInsert("raid_entries",
            byEffectiveType.issues.map((item, idx) => {
              const descParts: string[] = [];
              if (item.reporter_name) descParts.push(`Reporter: ${item.reporter_name}`);
              if (item.notes) descParts.push(item.notes);
              if (item.updates) descParts.push(`--- Updates ---\n${item.updates}`);
              if (item.attachments) descParts.push(`--- Screenshots/Videos ---\n${item.attachments}`);
              const description = descParts.length > 0 ? descParts.join("\n\n") : (item.details || item.rationale || null);

              return {
                org_id: orgId,
                raid_type: "issue" as const,
                display_id: `I${(count || 0) + idx + 1}`,
                title: item.title || item.subject,
                impact: item.impact || item.impact_description || null,
                description,
                priority: item.priority || "medium",
                owner_id: findPersonId(item.owner_name),
                reporter_id: findPersonId(item.reporter_name) || null,
                project_id: item._project_id || null,
                vendor_id: item._vendor_id || null,
                first_flagged_at: item.date_reported || today,
                created_by: profileId,
              };
            })
          );
        }

        // Create risks as RAID entries
        if (byEffectiveType.risks.length > 0) {
          const { count } = await supabase
            .from("raid_entries")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("raid_type", "risk");

          await batchInsert("raid_entries",
            byEffectiveType.risks.map((item, idx) => ({
              org_id: orgId,
              raid_type: "risk" as const,
              display_id: `R${(count || 0) + idx + 1}`,
              title: item.title || item.subject,
              impact: item.impact || item.impact_description || null,
              description: item.mitigation || item.notes || item.details || null,
              priority: item.priority || "medium",
              project_id: item._project_id || null,
              first_flagged_at: today,
              created_by: profileId,
            }))
          );
        }

        // Create blockers
        await batchInsert("blockers",
          byEffectiveType.blockers.map((item) => ({
            org_id: orgId,
            title: item.title || item.subject,
            impact_description: item.impact_description || item.impact || item.notes || item.details || null,
            owner_id: findPersonId(item.owner_name),
            vendor_id: item._vendor_id || null,
            project_id: item._project_id || null,
            priority: item.priority || "high",
            first_flagged_at: today,
            created_by: profileId,
          }))
        );
      } catch (batchErr) {
        // Rollback all previously created items
        await rollbackCreated();
        throw batchErr;
      }

      // Process linked items based on _link_action: update, replace, or child
      const errors: string[] = [];
      for (const { item, cat, linkedTo, action } of linkedItems) {
        const effectiveCat = item._save_as || cat;
        const today = new Date().toISOString().split("T")[0];

        // Validate that the linked parent item actually exists in the DB
        const { data: parentExists } = await supabase
          .from(linkedTo.table)
          .select("id")
          .eq("id", linkedTo.id)
          .maybeSingle();

        if (!parentExists) {
          // Parent doesn't exist — create as standalone item instead
          console.warn(`[Confirm] Linked parent "${linkedTo.title}" (${linkedTo.id}) not found in ${linkedTo.table}, creating as standalone`);
          try {
            if (effectiveCat === "action_items") {
              const { error: err } = await supabase.from("action_items").insert({
                org_id: orgId, title: item.title || item.subject,
                owner_id: findPersonId(item.owner_name), vendor_id: item._vendor_id || null,
                project_id: item._project_id || null, priority: item.priority || "medium",
                status: item.status || "pending", due_date: item.due_date || null,
                first_flagged_at: today, notes: item.notes || item.details || null, created_by: profileId,
              });
              if (err) errors.push(`Create standalone ${item.title}: ${err.message}`);
            } else if (effectiveCat === "blockers") {
              const { error: err } = await supabase.from("blockers").insert({
                org_id: orgId, title: item.title || item.subject,
                impact_description: item.impact_description || item.impact || item.notes || item.details || null,
                owner_id: findPersonId(item.owner_name), vendor_id: item._vendor_id || null,
                project_id: item._project_id || null, priority: item.priority || "high",
                first_flagged_at: today, created_by: profileId,
              });
              if (err) errors.push(`Create standalone ${item.title}: ${err.message}`);
            } else if (effectiveCat === "decisions" || effectiveCat === "issues" || effectiveCat === "risks") {
              const raidType = effectiveCat === "decisions" ? "decision" : effectiveCat === "issues" ? "issue" : "risk";
              const prefix = raidType === "decision" ? "D" : raidType === "issue" ? "I" : "R";
              const { count } = await supabase.from("raid_entries")
                .select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("raid_type", raidType);
              const descParts: string[] = [];
              if (effectiveCat === "issues") {
                if (item.reporter_name) descParts.push(`Reporter: ${item.reporter_name}`);
                if (item.notes) descParts.push(item.notes);
              } else if (effectiveCat === "decisions") {
                if (item.rationale) descParts.push(item.rationale);
              } else {
                if (item.mitigation) descParts.push(item.mitigation);
              }
              if (!descParts.length && (item.notes || item.details)) descParts.push(item.notes || item.details || "");
              const { error: err } = await supabase.from("raid_entries").insert({
                org_id: orgId, raid_type: raidType, display_id: `${prefix}${(count || 0) + 1}`,
                title: item.title || item.subject, description: descParts.join("\n\n") || null,
                impact: (effectiveCat === "issues" || effectiveCat === "risks") ? (item.impact || item.impact_description || null) : undefined,
                owner_id: findPersonId(item.made_by || item.owner_name),
                project_id: item._project_id || null, vendor_id: item._vendor_id || null,
                priority: item.priority || "medium", created_by: profileId,
                first_flagged_at: item.decision_date || item.date_reported || today,
              });
              if (err) errors.push(`Create standalone ${item.title}: ${err.message}`);
            }
          } catch (e) {
            errors.push(`Create standalone ${item.title}: ${(e as Error).message}`);
          }
          continue;
        }

        try {
          // --- UPDATE action: merge non-empty fields into existing, add notes as comment ---
          if (action === "update" || effectiveCat === "status_updates") {
            const payload: Record<string, unknown> = {};
            const ownerId = findPersonId(item.owner_name || item.made_by);

            if (linkedTo.table === "action_items") {
              if (ownerId) payload.owner_id = ownerId;
              if (item.priority) payload.priority = item.priority;
              if (item.due_date) payload.due_date = item.due_date;
              if (item.status || item.new_status) payload.status = item.new_status || item.status;
            } else if (linkedTo.table === "blockers") {
              if (ownerId) payload.owner_id = ownerId;
              if (item.priority) payload.priority = item.priority;
              if (item.status || item.new_status) payload.status = item.new_status || item.status;
            } else if (linkedTo.table === "raid_entries") {
              if (ownerId) payload.owner_id = ownerId;
              if (item.priority) payload.priority = item.priority;
              if (item.status || item.new_status) payload.status = item.new_status || item.status;
            }

            if (Object.keys(payload).length > 0) {
              const { error: err } = await supabase.from(linkedTo.table).update(payload).eq("id", linkedTo.id);
              if (err) errors.push(`Update ${linkedTo.title}: ${err.message}`);
            }

            // Add extracted notes/details as a comment
            const noteText = item.notes || item.details || item.rationale || item.impact || item.impact_description || item.mitigation || null;
            if (noteText) {
              // Find or create the person who authored this
              const authorPersonId = findPersonId(item.owner_name || item.made_by);
              const commentPayload: Record<string, unknown> = {
                org_id: orgId, body: noteText, author_id: authorPersonId,
              };
              if (linkedTo.table === "action_items") commentPayload.action_item_id = linkedTo.id;
              else if (linkedTo.table === "blockers") commentPayload.blocker_id = linkedTo.id;
              else if (linkedTo.table === "raid_entries") commentPayload.raid_entry_id = linkedTo.id;
              const { error: commentErr } = await supabase.from("comments").insert(commentPayload);
              if (commentErr) errors.push(`Comment on ${linkedTo.title}: ${commentErr.message}`);
            }
            continue;
          }

          // --- REPLACE action: overwrite existing item with extracted values ---
          if (action === "replace") {
            const ownerId = findPersonId(item.owner_name || item.made_by);
            const noteText = item.notes || item.details || item.rationale || item.impact_description || item.mitigation || null;

            if (linkedTo.table === "action_items") {
              const { error: err } = await supabase.from("action_items").update({
                title: item.title || item.subject,
                owner_id: ownerId,
                priority: item.priority || "medium",
                status: item.status || item.new_status || "pending",
                due_date: item.due_date || null,
                notes: noteText,
                vendor_id: item._vendor_id || null,
                project_id: item._project_id || null,
              }).eq("id", linkedTo.id);
              if (err) errors.push(`Replace ${linkedTo.title}: ${err.message}`);
            } else if (linkedTo.table === "blockers") {
              const { error: err } = await supabase.from("blockers").update({
                title: item.title || item.subject,
                owner_id: ownerId,
                priority: item.priority || "high",
                status: item.status || item.new_status || "pending",
                impact_description: item.impact_description || item.impact || noteText,
                vendor_id: item._vendor_id || null,
                project_id: item._project_id || null,
              }).eq("id", linkedTo.id);
              if (err) errors.push(`Replace ${linkedTo.title}: ${err.message}`);
            } else if (linkedTo.table === "raid_entries") {
              const { error: err } = await supabase.from("raid_entries").update({
                title: item.title || item.subject,
                owner_id: ownerId,
                priority: item.priority || "medium",
                status: item.status || item.new_status || "pending",
                description: noteText,
                impact: item.impact || item.impact_description || null,
                vendor_id: item._vendor_id || null,
                project_id: item._project_id || null,
              }).eq("id", linkedTo.id);
              if (err) errors.push(`Replace ${linkedTo.title}: ${err.message}`);
            }
            continue;
          }

          // --- CHILD action: create as new child/subtask linked to existing ---
          const parentRef = `Related to: ${linkedTo.title}`;

          // For all other types: create as a new item, with parent link where possible
          if (effectiveCat === "action_items") {
            const { error: err } = await supabase.from("action_items").insert({
              org_id: orgId,
              title: item.title || item.subject,
              owner_id: findPersonId(item.owner_name),
              vendor_id: item._vendor_id || null,
              project_id: item._project_id || null,
              priority: item.priority || "medium",
              status: item.status || "pending",
              due_date: item.due_date || null,
              first_flagged_at: today,
              notes: [parentRef, item.notes || item.details || item.rationale || item.impact_description].filter(Boolean).join("\n\n"),
              created_by: profileId,
            });
            if (err) errors.push(`Create ${item.title}: ${err.message}`);

          } else if (effectiveCat === "blockers") {
            const { error: err } = await supabase.from("blockers").insert({
              org_id: orgId,
              title: item.title || item.subject,
              impact_description: [parentRef, item.impact_description || item.impact || item.notes || item.details].filter(Boolean).join("\n\n"),
              owner_id: findPersonId(item.owner_name),
              vendor_id: item._vendor_id || null,
              project_id: item._project_id || null,
              priority: item.priority || "high",
              first_flagged_at: today,
              created_by: profileId,
            });
            if (err) errors.push(`Create ${item.title}: ${err.message}`);

          } else if (effectiveCat === "decisions" || effectiveCat === "issues" || effectiveCat === "risks") {
            // RAID entries: use parent_id if the linked item is also a raid_entry
            const raidType = effectiveCat === "decisions" ? "decision" : effectiveCat === "issues" ? "issue" : "risk";
            const prefix = raidType === "decision" ? "D" : raidType === "issue" ? "I" : "R";
            const { count } = await supabase
              .from("raid_entries")
              .select("*", { count: "exact", head: true })
              .eq("org_id", orgId)
              .eq("raid_type", raidType);

            const parentId = linkedTo.table === "raid_entries" ? linkedTo.id : null;
            const descParts: string[] = [];
            if (!parentId) descParts.push(parentRef); // cross-table ref in description
            if (effectiveCat === "decisions") {
              if (item.rationale) descParts.push(item.rationale);
            } else if (effectiveCat === "issues") {
              if (item.reporter_name) descParts.push(`Reporter: ${item.reporter_name}`);
              if (item.notes) descParts.push(item.notes);
              if (item.updates) descParts.push(`--- Updates ---\n${item.updates}`);
              if (item.attachments) descParts.push(`--- Screenshots/Videos ---\n${item.attachments}`);
            } else {
              if (item.mitigation) descParts.push(item.mitigation);
            }
            if (!descParts.length && (item.notes || item.details)) descParts.push(item.notes || item.details || "");

            const { error: err } = await supabase.from("raid_entries").insert({
              org_id: orgId,
              raid_type: raidType,
              display_id: `${prefix}${(count || 0) + 1}`,
              title: item.title || item.subject,
              description: effectiveCat !== "issues" ? (descParts.join("\n\n") || null) : undefined,
              impact: effectiveCat === "issues" ? (item.impact || item.impact_description || null) : (effectiveCat === "risks" ? (item.impact || null) : undefined),
              ...(effectiveCat === "issues" ? { description: descParts.join("\n\n") || null } : {}),
              owner_id: findPersonId(item.made_by || item.owner_name),
              reporter_id: effectiveCat === "issues" ? (findPersonId(item.reporter_name) || null) : undefined,
              project_id: item._project_id || null,
              vendor_id: item._vendor_id || null,
              decision_date: effectiveCat === "decisions" ? (item.decision_date || null) : undefined,
              first_flagged_at: item.decision_date || item.date_reported || today,
              priority: item.priority || "medium",
              parent_id: parentId,
              created_by: profileId,
            });
            if (err) errors.push(`Create ${item.title}: ${err.message}`);
          }
        } catch (e) {
          errors.push(`Create ${item.title}: ${(e as Error).message}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Some linked items failed to save:\n${errors.join("\n")}`);
      }

      // Log corrections for feedback loop (non-blocking)
      const original = originalExtractedRef.current;
      if (original) {
        const corrections: {
          org_id: string;
          intake_id: string;
          extracted_category: string;
          extracted_title: string;
          extracted_priority: string | null;
          correction_type: string;
          corrected_value: string | null;
        }[] = [];

        for (const [cat, items] of Object.entries(extracted) as [EntityCategory, ExtractedItem[]][]) {
          items.forEach((item, idx) => {
            const orig = original[cat]?.[idx];
            if (!orig) return;
            const origTitle = orig.title || orig.subject || "";
            const origPriority = orig.priority || null;

            if (item._accepted === false) {
              // User rejected this item
              corrections.push({
                org_id: orgId,
                intake_id: intakeId,
                extracted_category: cat,
                extracted_title: origTitle,
                extracted_priority: origPriority,
                correction_type: "rejected",
                corrected_value: null,
              });
            } else if (item._accepted === true) {
              const curTitle = item.title || item.subject || "";

              // Title was edited
              if (curTitle !== origTitle && curTitle.trim() !== "") {
                corrections.push({
                  org_id: orgId,
                  intake_id: intakeId,
                  extracted_category: cat,
                  extracted_title: origTitle,
                  extracted_priority: origPriority,
                  correction_type: "title_edit",
                  corrected_value: curTitle,
                });
              }

              // Type was reassigned
              if (item._save_as && item._save_as !== cat) {
                corrections.push({
                  org_id: orgId,
                  intake_id: intakeId,
                  extracted_category: cat,
                  extracted_title: origTitle,
                  extracted_priority: origPriority,
                  correction_type: "type_change",
                  corrected_value: item._save_as,
                });
              }

              // Priority was changed
              if (item.priority && item.priority !== origPriority) {
                corrections.push({
                  org_id: orgId,
                  intake_id: intakeId,
                  extracted_category: cat,
                  extracted_title: origTitle,
                  extracted_priority: origPriority,
                  correction_type: "priority_change",
                  corrected_value: item.priority,
                });
              }

              // Accepted without changes (positive signal)
              if (
                curTitle === origTitle &&
                (!item._save_as || item._save_as === cat) &&
                (!item.priority || item.priority === origPriority)
              ) {
                corrections.push({
                  org_id: orgId,
                  intake_id: intakeId,
                  extracted_category: cat,
                  extracted_title: origTitle,
                  extracted_priority: origPriority,
                  correction_type: "accepted_as_is",
                  corrected_value: null,
                });
              }
            }
          });
        }

        if (corrections.length > 0) {
          // Fire and forget — don't block navigation on logging
          supabase.from("correction_log").insert(corrections);
        }
      }

      // Mark intake as confirmed
      await supabase.from("intakes").update({ extraction_status: "confirmed" }).eq("id", intake.id);

      // Force a full navigation to dashboard
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("[Confirm] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to confirm");
      setConfirming(false);
    }
  }

  const totalItems = Object.values(extracted).flat().length;
  const allAccepted = Object.values(extracted).flat().filter((i) => i._accepted === true);
  const totalAccepted = allAccepted.length;
  const totalLinked = allAccepted.filter((i) => i._linked_to).length;
  const totalNew = totalAccepted - totalLinked;

  // Categories that have items
  const activeCats = (Object.entries(extracted) as [EntityCategory, ExtractedItem[]][])
    .filter(([, items]) => items.length > 0)
    .map(([cat]) => cat);

  // Current tab items
  const currentTabItems = activeTab ? extracted[activeTab] : [];
  const currentItem = currentTabItems[activeIndex] || null;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-gray-500">Loading extraction results...</p>
      </div>
    );
  }

  if (!intake) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-red-600">{error || "Intake not found"}</p>
      </div>
    );
  }

  // Render a single card for a given category and index
  function renderCard(category: EntityCategory, idx: number, item: ExtractedItem) {
    return (
      <div
        className={`rounded-lg border p-3 transition-all duration-300 ${
          item._accepted === true
            ? "border-green-300 bg-green-100"
            : item._accepted === false
              ? "border-gray-300 bg-gray-200 opacity-50"
              : categoryColors[category]
        }`}
      >
        {item._editing ? (
          /* Edit mode */
          <div className="space-y-2">
            {/* Type reassignment dropdown */}
            {category !== "status_updates" && (
              <div className="flex items-start gap-2">
                <label className="text-xs text-gray-500 w-16 flex-shrink-0 pt-1">Type</label>
                <select
                  value={item._save_as || category}
                  onChange={(e) => {
                    const newType = e.target.value as EntityCategory;
                    setExtracted((prev) => ({
                      ...prev,
                      [category]: prev[category].map((it, i) =>
                        i === idx
                          ? {
                              ...it,
                              _save_as: newType === category ? undefined : newType,
                              _linked_to: newType !== (it._save_as || category) ? null : it._linked_to,
                              _edited: true,
                            }
                          : it
                      ),
                    }));
                  }}
                  className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                >
                  {reassignableCategories.map((cat) => (
                    <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                  ))}
                </select>
              </div>
            )}
            {((item._save_as && item._save_as !== category ? categoryFields[item._save_as] : categoryFields[category])).map((fieldDef) => {
              const val = (item as unknown as Record<string, unknown>)[fieldDef.field] as string || "";
              return (
                <div key={fieldDef.field} className="flex items-start gap-2">
                  <label className="text-xs text-gray-500 w-16 flex-shrink-0 pt-1">{fieldDef.label}</label>
                  {fieldDef.type === "text" && (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                      className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                    />
                  )}
                  {fieldDef.type === "date" && (
                    <input
                      type="date"
                      value={val}
                      onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                      className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                    />
                  )}
                  {fieldDef.type === "textarea" && (
                    <textarea
                      value={val}
                      onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                      rows={2}
                      className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none resize-y"
                    />
                  )}
                  {fieldDef.type === "select" && fieldDef.field === "priority" && (
                    <select
                      value={val}
                      onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                      className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {priorityOptions.map((p) => (
                        <option key={p} value={p}>{priorityLabel(p)}</option>
                      ))}
                    </select>
                  )}
                  {fieldDef.type === "select" && fieldDef.field === "new_status" && (
                    <select
                      value={val}
                      onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                      className="flex-1 text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">—</option>
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                      ))}
                    </select>
                  )}
                  {fieldDef.type === "person" && (() => {
                    const isKnown = people.some((pr) => pr.full_name === val);
                    const showInput = val && !isKnown;
                    return (
                      <div className="flex-1">
                        <select
                          value={isKnown ? val : showInput ? "__new__" : ""}
                          onChange={(e) => {
                            if (e.target.value === "__new__") {
                              updateItem(category, idx, fieldDef.field, " ");
                            } else {
                              updateItem(category, idx, fieldDef.field, e.target.value);
                            }
                          }}
                          className="w-full text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">— Unassigned —</option>
                          {people.map((pr) => (
                            <option key={pr.id} value={pr.full_name}>{pr.full_name}</option>
                          ))}
                          <option value="__new__">+ New Person</option>
                        </select>
                        {showInput && (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => updateItem(category, idx, fieldDef.field, e.target.value)}
                            placeholder="Full name"
                            className="mt-1 w-full text-sm text-gray-900 bg-white/60 rounded border border-gray-200 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Per-item project/vendor assignment */}
            {category !== "status_updates" && (
              <div className="flex items-start gap-2">
                <label className="text-xs text-gray-500 w-16 flex-shrink-0 pt-1">Assign</label>
                <div className="flex-1 flex gap-2">
                  <select
                    value={item._project_id || ""}
                    onChange={(e) => updateItem(category, idx, "_project_id", e.target.value || "")}
                    className="flex-1 text-xs rounded border border-gray-200 px-2 py-1 bg-white/60 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={item._vendor_id || ""}
                    onChange={(e) => updateItem(category, idx, "_vendor_id", e.target.value || "")}
                    className="flex-1 text-xs rounded border border-gray-200 px-2 py-1 bg-white/60 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">No vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Read-only detail view with inline-editable key fields */
          <div className="space-y-2">
            {editingTitleKey === `${category}-${idx}` ? (
              <input
                type="text"
                value={item.title || item.subject || ""}
                onChange={(e) => updateItem(category, idx, category === "status_updates" ? "subject" : "title", e.target.value)}
                onBlur={() => setEditingTitleKey(null)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitleKey(null); }}
                autoFocus
                className="text-sm font-semibold text-gray-900 w-full border-b border-blue-400 focus:outline-none bg-transparent pb-0.5"
              />
            ) : (
              <p
                className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors"
                onClick={() => setEditingTitleKey(`${category}-${idx}`)}
                title="Click to edit title"
              >
                {item.title || item.subject || ""}
              </p>
            )}

            {/* Property grid — key fields are inline-editable */}
            <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5 text-xs">
              {/* Type — reassign to different category */}
              {category !== "status_updates" && (
                <>
                  <span className="text-gray-500 py-0.5">Type</span>
                  <select
                    value={item._save_as || category}
                    onChange={(e) => {
                      const newType = e.target.value as EntityCategory;
                      setExtracted((prev) => ({
                        ...prev,
                        [category]: prev[category].map((it, i) =>
                          i === idx
                            ? {
                                ...it,
                                _save_as: newType === category ? undefined : newType,
                                _linked_to: newType !== (it._save_as || category) ? null : it._linked_to,
                                _edited: true,
                              }
                            : it
                        ),
                      }));
                    }}
                    className="text-xs text-gray-900 bg-white rounded border border-gray-200 px-1.5 py-0.5 focus:border-blue-500 focus:outline-none"
                  >
                    {reassignableCategories.map((cat) => (
                      <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                    ))}
                  </select>
                </>
              )}
              {/* Owner — inline editable */}
              {(category === "action_items" || category === "issues" || category === "blockers") && (
                <>
                  <span className="text-gray-500 py-0.5">Owner</span>
                  <select
                    value={item.owner_name || ""}
                    onChange={(e) => updateItem(category, idx, "owner_name", e.target.value)}
                    className="text-xs text-gray-900 bg-white rounded border border-gray-200 px-1.5 py-0.5 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">— Unassigned —</option>
                    {people.map((pr) => (
                      <option key={pr.id} value={pr.full_name}>{pr.full_name}</option>
                    ))}
                  </select>
                </>
              )}
              {category === "decisions" && (
                <>
                  <span className="text-gray-500 py-0.5">Made By</span>
                  <select
                    value={item.made_by || ""}
                    onChange={(e) => updateItem(category, idx, "made_by", e.target.value)}
                    className="text-xs text-gray-900 bg-white rounded border border-gray-200 px-1.5 py-0.5 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">— Unassigned —</option>
                    {people.map((pr) => (
                      <option key={pr.id} value={pr.full_name}>{pr.full_name}</option>
                    ))}
                  </select>
                </>
              )}
              {item.reporter_name && (
                <>
                  <span className="text-gray-500">Reporter</span>
                  <span className="text-gray-700">{item.reporter_name}</span>
                </>
              )}
              {/* Priority — inline editable */}
              <>
                <span className="text-gray-500 py-0.5">Priority</span>
                <select
                  value={item.priority || "medium"}
                  onChange={(e) => updateItem(category, idx, "priority", e.target.value)}
                  className="text-xs text-gray-900 bg-white rounded border border-gray-200 px-1.5 py-0.5 focus:border-blue-500 focus:outline-none w-fit"
                >
                  {priorityOptions.map((p) => (
                    <option key={p} value={p}>{priorityLabel(p)}</option>
                  ))}
                </select>
              </>
              {item.status && (
                <>
                  <span className="text-gray-500">Status</span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded w-fit ${statusBadge(item.status as ItemStatus).className}`}>
                    {statusBadge(item.status as ItemStatus).label}
                  </span>
                </>
              )}
              {item.new_status && (
                <>
                  <span className="text-gray-500">New Status</span>
                  <span className="inline-flex px-1.5 py-0.5 rounded border border-gray-300 bg-gray-100 text-gray-700 w-fit">
                    {item.new_status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                  </span>
                </>
              )}
              {/* Due Date — inline editable, always shown for action items/blockers */}
              {(category === "action_items" || category === "blockers" || item.due_date) && (
                <>
                  <span className="text-gray-500 py-0.5">Due Date</span>
                  <input
                    type="date"
                    value={item.due_date || ""}
                    onChange={(e) => updateItem(category, idx, "due_date", e.target.value)}
                    className="text-xs text-gray-900 bg-white rounded border border-gray-200 px-1.5 py-0.5 focus:border-blue-500 focus:outline-none w-fit"
                  />
                </>
              )}
              {item.decision_date && (
                <>
                  <span className="text-gray-500">Decision Date</span>
                  <span className="text-gray-700">{item.decision_date}</span>
                </>
              )}
              {item.date_reported && (
                <>
                  <span className="text-gray-500">Reported</span>
                  <span className="text-gray-700">{item.date_reported}</span>
                </>
              )}
              {item.confidence && item.confidence !== "high" && (
                <>
                  <span className="text-gray-500">Confidence</span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded border w-fit ${
                    item.confidence === "low" ? "border-red-300 bg-red-50 text-red-700" : "border-yellow-300 bg-yellow-50 text-yellow-700"
                  }`}>
                    {item.confidence}
                  </span>
                </>
              )}
              {item._project_id && (() => {
                const proj = projects.find((p) => p.id === item._project_id);
                return proj ? (
                  <>
                    <span className="text-gray-500">Project</span>
                    <span className="text-gray-700">{proj.name}</span>
                  </>
                ) : null;
              })()}
              {item._vendor_id && (() => {
                const vend = vendors.find((v) => v.id === item._vendor_id);
                return vend ? (
                  <>
                    <span className="text-gray-500">Vendor</span>
                    <span className="text-gray-700">{vend.name}</span>
                  </>
                ) : null;
              })()}
            </div>

            {/* Detail text fields */}
            {(item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation) && (
              <div className="border-t border-gray-200 pt-2 mt-2">
                <p className="text-xs text-gray-600 whitespace-pre-line">
                  {item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation}
                </p>
              </div>
            )}
            {item.attachments && (
              <p className="text-xs text-blue-600 break-all">{item.attachments}</p>
            )}
            {item.updates && (
              <div className="text-xs text-gray-500">
                <span className="font-medium">Updates:</span>
                <p className="whitespace-pre-line">{item.updates}</p>
              </div>
            )}
            {item._save_as && item._save_as !== category && (
              <p className="text-xs text-blue-600 font-medium">
                → Saving as {categoryLabels[item._save_as]}
              </p>
            )}
          </div>
        )}
        {/* Linked indicator with action label */}
        {item._linked_to && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
              item._link_action === "update" ? "bg-blue-100 text-blue-700" :
              item._link_action === "replace" ? "bg-amber-100 text-amber-700" :
              "bg-green-100 text-green-700"
            }`}>
              {item._link_action === "update" ? "Will update" : item._link_action === "replace" ? "Will replace" : "Add as child"}
            </span>
            <span className="truncate">{item._linked_to.title}</span>
            {item._linked_to.project_name && (
              <span className="inline-flex px-1 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 border border-orange-200 font-medium flex-shrink-0">
                {item._linked_to.project_name}
              </span>
            )}
            <button
              onClick={() => unlinkItem(category, idx)}
              className="ml-1 text-amber-500 hover:text-amber-700 transition-colors flex-shrink-0"
              title="Unlink"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
        {/* Match suggestions — tree lines connecting to parent card */}
        {!item._editing && matchResults[`${category}-${idx}`] && (
          (() => {
            const candidates = matchResults[`${category}-${idx}`].filter(
              (c) => !dismissedMatches.has(`${category}-${idx}-${c.id}`)
            );
            if (candidates.length === 0) return null;
            return (
              <div className="mt-3 pt-2 border-t border-gray-200">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Possibly related</span>
                <div className="mt-1.5 space-y-0">
                  {candidates.map((candidate, cIdx) => {
                    const isLinked = item._linked_to?.id === candidate.id;
                    const linkAction = isLinked ? item._link_action : undefined;
                    const sb = statusBadge(candidate.status as ItemStatus);
                    const isLast = cIdx === candidates.length - 1;
                    return (
                      <div key={candidate.id} className="flex">
                        {/* Tree connector */}
                        <div className="flex flex-col items-center w-6 flex-shrink-0">
                          <div className={`w-px bg-gray-300 ${isLast ? "h-3" : "flex-1"}`} />
                          <div className="flex items-center">
                            <div className="w-3 h-px bg-gray-300" />
                          </div>
                          {!isLast && <div className="w-px bg-gray-300 flex-1" />}
                        </div>
                        {/* Related card */}
                        <div className={`flex-1 rounded border p-2 text-xs mb-1 ${
                          isLinked ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 truncate">{candidate.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${priorityColor(candidate.priority as PriorityLevel)}`}>
                                  {priorityLabel(candidate.priority as PriorityLevel)}
                                </span>
                                <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${sb.className}`}>
                                  {sb.label}
                                </span>
                                <span className="text-gray-400 text-[10px]">{candidate.reason}</span>
                                {candidate.project_name && (
                                  <span className="inline-flex px-1 py-0.5 rounded text-[10px] bg-orange-100 text-orange-700 border border-orange-200 font-medium">
                                    {candidate.project_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => dismissMatch(category, idx, candidate.id)}
                              className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                              title="Dismiss suggestion"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-gray-100">
                            <button
                              onClick={() => linkItem(category, idx, candidate, "update")}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                linkAction === "update"
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                              }`}
                              title="Merge new info into existing item (fills blanks, adds notes as comment)"
                            >
                              Update
                            </button>
                            <button
                              onClick={() => linkItem(category, idx, candidate, "replace")}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                linkAction === "replace"
                                  ? "bg-amber-600 text-white"
                                  : "bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700"
                              }`}
                              title="Overwrite existing item with extracted values"
                            >
                              Replace
                            </button>
                            <button
                              onClick={() => linkItem(category, idx, candidate, "child")}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                linkAction === "child"
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700"
                              }`}
                              title="Create as new child/subtask of existing item"
                            >
                              Add as Child
                            </button>
                            {isLinked && (
                              <button
                                onClick={() => unlinkItem(category, idx)}
                                className="ml-auto text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                              >
                                Unlink
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        )}
        {/* Manual search for related items */}
        {!item._editing && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            {searchOpen === `${category}-${idx}` ? (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") searchExistingItems(searchQuery); if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); } }}
                    placeholder="Search existing items..."
                    autoFocus
                    className="flex-1 text-xs rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={() => searchExistingItems(searchQuery)}
                    disabled={searching || !searchQuery.trim()}
                    className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {searching ? "..." : "Search"}
                  </button>
                  <button
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {searchResults.map((result) => {
                      const isLinked = item._linked_to?.id === result.id;
                      const sb = statusBadge(result.status as ItemStatus);
                      return (
                        <div key={result.id} className={`flex items-center gap-2 rounded border p-1.5 text-xs ${isLinked ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 truncate">{result.title}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${priorityColor(result.priority as PriorityLevel)}`}>
                                {priorityLabel(result.priority as PriorityLevel)}
                              </span>
                              <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${sb.className}`}>{sb.label}</span>
                              {result.raid_type && <span className="text-[10px] text-gray-400">{result.raid_type}</span>}
                              {result.project_name && <span className="text-[10px] text-orange-600">{result.project_name}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => { linkItem(category, idx, result, "update"); setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700">Update</button>
                            <button onClick={() => { linkItem(category, idx, result, "replace"); setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700">Replace</button>
                            <button onClick={() => { linkItem(category, idx, result, "child"); setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-700">Child</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {searchResults.length === 0 && searchQuery && !searching && (
                  <p className="text-[10px] text-gray-400">No results. Try a different keyword.</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setSearchOpen(`${category}-${idx}`); setSearchQuery(""); setSearchResults([]); }}
                className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
              >
                + Link to existing item
              </button>
            )}
          </div>
        )}
        <div className="flex justify-end items-center gap-2 mt-2">
          {item._editing ? (
            <>
              <button
                onClick={() => cancelEdit(category, idx)}
                className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveEdit(category, idx)}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </>
          ) : (
            <>
              {item.source_quote && (
                <button
                  onClick={() => scrollToSource(item.source_quote)}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  title="View source in original text"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => startEdit(category, idx)}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button
                onClick={() => acceptItem(category, idx, true)}
                className={`transition-colors ${
                  item._accepted === true
                    ? "text-green-600"
                    : "text-gray-300 hover:text-green-600"
                }`}
                title="Accept (A)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
              <button
                onClick={() => rejectItem(category, idx, true)}
                className={`transition-colors ${
                  item._accepted === false
                    ? "text-red-500"
                    : "text-gray-300 hover:text-red-500"
                }`}
                title="Reject (X)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Extraction</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalItems} items extracted. {totalAccepted} accepted.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Category tabs */}
      {activeCats.length > 0 && (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {activeCats.map((cat) => {
              const items = extracted[cat];
              const acceptedCount = items.filter((i) => i._accepted === true).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setActiveTab(cat); setActiveIndex(0); }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === cat
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {categoryLabels[cat]}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === cat ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {acceptedCount}/{items.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Card navigation + single card */}
          {activeTab && currentTabItems.length > 0 && (
            <div className="space-y-3">
              {/* Toolbar: Accept All + nav */}
              <div className="flex items-center justify-between">
                {/* Accept All */}
                {(() => {
                  const unreviewed = currentTabItems.filter((i) => i._accepted === undefined).length;
                  const allAccepted = currentTabItems.every((i) => i._accepted === true || i._accepted === false);
                  return unreviewed > 0 ? (
                    <button
                      onClick={() => activeTab && acceptAllInCategory(activeTab)}
                      className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                    >
                      Accept All ({unreviewed})
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">{allAccepted ? "All reviewed" : ""}</span>
                  );
                })()}

                {/* Nav arrows + counter */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={activeIndex === 0}
                    className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous (←)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                  <span className="text-sm text-gray-500 tabular-nums px-1">
                    {activeIndex + 1} / {currentTabItems.length}
                  </span>
                  <button
                    onClick={() => setActiveIndex((i) => Math.min(currentTabItems.length - 1, i + 1))}
                    disabled={activeIndex >= currentTabItems.length - 1}
                    className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next (→)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Keyboard hint */}
              <p className="text-[10px] text-gray-400 text-right">
                A accept &middot; X reject &middot; E edit &middot; ← → navigate
              </p>

              {/* The card */}
              {currentItem && renderCard(activeTab, activeIndex, currentItem)}

              {matchLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
                  <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Checking for related existing items...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {totalItems === 0 && (
        <p className="text-sm text-gray-500">
          No entities were extracted from the text.
        </p>
      )}

      {/* Raw text / Import source — below the card */}
      {intake.raw_text.startsWith("[Spreadsheet Import]") ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Import Source
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 flex-shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Spreadsheet Import</p>
                <p className="text-xs text-gray-500 mt-0.5">{intake.raw_text}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Original Text
          </h2>
          <div ref={rawTextRef} className="bg-white rounded-lg border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{highlightedQuote ? renderHighlightedText(intake.raw_text, highlightedQuote) : intake.raw_text}</pre>
          </div>
        </div>
      )}

      {totalAccepted > 0 && (
        <div className="fixed bottom-0 left-0 md:left-56 right-0 bg-gray-50 border-t border-gray-200 px-6 py-4 z-10">
          <div className="max-w-3xl mx-auto flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {totalLinked > 0
                ? [
                    totalNew > 0 && `${totalNew} new`,
                    allAccepted.filter((i) => i._link_action === "update").length > 0 && `${allAccepted.filter((i) => i._link_action === "update").length} update${allAccepted.filter((i) => i._link_action === "update").length !== 1 ? "s" : ""}`,
                    allAccepted.filter((i) => i._link_action === "replace").length > 0 && `${allAccepted.filter((i) => i._link_action === "replace").length} replace`,
                    allAccepted.filter((i) => i._link_action === "child").length > 0 && `${allAccepted.filter((i) => i._link_action === "child").length} child`,
                  ].filter(Boolean).join(", ")
                : `${totalAccepted} items will be created`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/intake")}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {confirming ? "Saving..." : `Confirm ${totalAccepted} Items`}
              </button>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mt-3">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

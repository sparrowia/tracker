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
              converted[key] = (candidates as { existing_id: string; existing_table: string; title: string; status: string; priority: string; raid_type?: string; confidence: "high" | "medium"; reason: string }[]).map((c) => ({
                table: c.existing_table as MatchCandidate["table"],
                id: c.existing_id,
                title: c.title,
                status: c.status,
                priority: c.priority,
                raid_type: c.raid_type,
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

  function acceptItem(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _accepted: item._accepted === true ? undefined : true } : item
      ),
    }));
  }

  function rejectItem(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _accepted: item._accepted === false ? undefined : false } : item
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

  function linkItem(category: EntityCategory, index: number, candidate: MatchCandidate) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _linked_to: candidate, _accepted: true } : item
      ),
    }));
  }

  function unlinkItem(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _linked_to: null } : item
      ),
    }));
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
      for (const [cat, items] of Object.entries(extracted) as [EntityCategory, ExtractedItem[]][]) {
        for (const item of items) {
          if (item._accepted !== true || item._linked_to) continue;
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

      // Update linked items (these are updates to existing records, tracked separately)
      const errors: string[] = [];
      for (const [cat, items] of Object.entries(extracted) as [EntityCategory, ExtractedItem[]][]) {
        for (const item of items) {
          if (item._accepted !== true || !item._linked_to) continue;

          const linkedTo = item._linked_to;
          const table = linkedTo.table;
          const id = linkedTo.id;
          const effectiveCat = item._save_as || cat;

          const payload: Record<string, unknown> = {};

          // Status updates: apply new_status but don't overwrite the existing item's title
          if (effectiveCat === "status_updates") {
            if (item.new_status) payload.status = item.new_status;
            // For status updates, use details as append content instead of overwriting title
          } else {
            // For non-status-updates, update title + priority
            if (item.title || item.subject) payload.title = item.title || item.subject;
            if (item.priority) payload.priority = item.priority;
          }

          if (item.due_date) payload.due_date = item.due_date;

          // Owner — only update if extracted has one
          const ownerName = effectiveCat === "decisions" ? item.made_by : item.owner_name;
          if (ownerName) {
            const ownerId = findPersonId(ownerName);
            if (ownerId) payload.owner_id = ownerId;
          }

          // Notes/description append with datestamp
          let appendField: string | null = null;
          let appendContent: string | null = null;

          if (effectiveCat === "status_updates") {
            // Status updates: append details to the linked item's notes/description
            const statusDetails = item.details || item.notes || null;
            if (statusDetails) {
              if (table === "action_items") { appendField = "notes"; appendContent = statusDetails; }
              else if (table === "blockers") { appendField = "impact_description"; appendContent = statusDetails; }
              else if (table === "raid_entries") { appendField = "description"; appendContent = statusDetails; }
            }
          } else if (table === "action_items") {
            appendField = "notes";
            appendContent = item.notes || null;
          } else if (table === "blockers") {
            appendField = "impact_description";
            appendContent = item.impact_description || null;
          } else if (table === "raid_entries") {
            if (linkedTo.raid_type === "issue") {
              appendField = "impact";
              appendContent = item.impact || null;
            } else if (linkedTo.raid_type === "risk") {
              appendField = "description";
              appendContent = item.mitigation || null;
            } else if (linkedTo.raid_type === "decision") {
              appendField = "description";
              appendContent = item.rationale || null;
            }
          }

          if (appendField && appendContent) {
            const { data: current } = await supabase
              .from(table)
              .select(appendField)
              .eq("id", id)
              .single();

            const existing = (current as Record<string, string | null> | null)?.[appendField] || "";
            const today = new Date().toISOString().split("T")[0];
            payload[appendField] = existing
              ? `${existing}\n\n--- Update ${today} ---\n${appendContent}`
              : appendContent;
          }

          const { error: err } = await supabase.from(table).update(payload).eq("id", id);
          if (err) errors.push(`Update ${linkedTo.title}: ${err.message}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Some items failed to save:\n${errors.join("\n")}`);
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

  const totalItems = Object.values(extracted).flat().length;
  const allAccepted = Object.values(extracted).flat().filter((i) => i._accepted === true);
  const totalAccepted = allAccepted.length;
  const totalLinked = allAccepted.filter((i) => i._linked_to).length;
  const totalNew = totalAccepted - totalLinked;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-start">
        {/* Raw text / Import source */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {intake.raw_text.startsWith("[Spreadsheet Import]") ? (
            <>
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
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                Original Text
              </h2>
              <div ref={rawTextRef} className="bg-white rounded-lg border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{highlightedQuote ? renderHighlightedText(intake.raw_text, highlightedQuote) : intake.raw_text}</pre>
              </div>
            </>
          )}
        </div>

        {/* Extracted entities */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Extracted Entities
          </h2>

          {matchLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
              <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Checking for related existing items...
            </div>
          )}

          {(Object.entries(extracted) as [EntityCategory, ExtractedItem[]][]).map(
            ([category, items]) =>
              items.length > 0 && (
                <div key={category}>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    {categoryLabels[category]} ({items.filter((i) => i._accepted === true).length}/{items.length})
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 transition-all ${
                          item._accepted === true
                            ? "border-green-300 bg-green-50"
                            : item._accepted === false
                              ? "border-gray-200 bg-gray-100 opacity-50"
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
                          /* Read-only mode */
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {item.title || item.subject || ""}
                            </p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {item.owner_name && (
                                <span className="text-xs text-gray-500">Owner: {item.owner_name}</span>
                              )}
                              {item.reporter_name && (
                                <span className="text-xs text-gray-500">Reporter: {item.reporter_name}</span>
                              )}
                              {item.made_by && (
                                <span className="text-xs text-gray-500">By: {item.made_by}</span>
                              )}
                              {item.priority && (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(item.priority)}`}>
                                  {priorityLabel(item.priority)}
                                </span>
                              )}
                              {item.status && item.status !== "pending" && (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${
                                  item.status === "complete" ? "border-green-300 bg-green-50 text-green-700" : "border-blue-300 bg-blue-50 text-blue-700"
                                }`}>
                                  {item.status === "complete" ? "Complete" : "In Progress"}
                                </span>
                              )}
                              {item.confidence && item.confidence !== "high" && (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${
                                  item.confidence === "low" ? "border-red-300 bg-red-50 text-red-700" : "border-yellow-300 bg-yellow-50 text-yellow-700"
                                }`}>
                                  {item.confidence} confidence
                                </span>
                              )}
                              {item.new_status && (
                                <span className="inline-flex px-1.5 py-0.5 text-xs rounded border border-gray-300 bg-gray-100 text-gray-700">
                                  {item.new_status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                                </span>
                              )}
                              {(item.due_date || item.decision_date || item.date_reported) && (
                                <span className="text-xs text-gray-500">
                                  {item.due_date ? `Due: ${item.due_date}` : item.date_reported ? `Reported: ${item.date_reported}` : `Date: ${item.decision_date}`}
                                </span>
                              )}
                            </div>
                            {(item._project_id || item._vendor_id) && (
                              <div className="flex gap-2 mt-1 flex-wrap">
                                {item._project_id && (() => {
                                  const proj = projects.find((p) => p.id === item._project_id);
                                  return proj ? <span className="text-xs text-gray-500">Project: {proj.name}</span> : null;
                                })()}
                                {item._vendor_id && (() => {
                                  const vend = vendors.find((v) => v.id === item._vendor_id);
                                  return vend ? <span className="text-xs text-gray-500">Vendor: {vend.name}</span> : null;
                                })()}
                              </div>
                            )}
                            {(item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation) && (
                              <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">
                                {item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation}
                              </p>
                            )}
                            {item.attachments && (
                              <p className="text-xs text-blue-600 mt-1 break-all">
                                {item.attachments}
                              </p>
                            )}
                            {item.updates && (
                              <div className="text-xs text-gray-500 mt-1">
                                <span className="font-medium">Updates:</span>
                                <p className="whitespace-pre-line">{item.updates}</p>
                              </div>
                            )}
                            {item._save_as && item._save_as !== category && (
                              <p className="text-xs text-blue-600 mt-1.5 font-medium">
                                → Saving as {categoryLabels[item._save_as]}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Linked indicator */}
                        {item._linked_to && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                            </svg>
                            <span className="font-medium">Will update:</span> {item._linked_to.title}
                            <button
                              onClick={() => unlinkItem(category, idx)}
                              className="ml-1 text-amber-500 hover:text-amber-700 transition-colors"
                              title="Unlink"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        )}
                        {/* Match suggestions */}
                        {!item._editing && matchResults[`${category}-${idx}`] && (
                          (() => {
                            const candidates = matchResults[`${category}-${idx}`].filter(
                              (c) => !dismissedMatches.has(`${category}-${idx}-${c.id}`)
                            );
                            if (candidates.length === 0) return null;
                            return (
                              <div className="ml-4 mt-2 space-y-1.5">
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Possibly related</span>
                                {candidates.map((candidate) => {
                                  const isLinked = item._linked_to?.id === candidate.id;
                                  const sb = statusBadge(candidate.status as ItemStatus);
                                  return (
                                    <div
                                      key={candidate.id}
                                      className={`flex items-center gap-2 rounded border border-dashed p-2 text-xs ${
                                        isLinked ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-white"
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-800 truncate">{candidate.title}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                          <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${priorityColor(candidate.priority as PriorityLevel)}`}>
                                            {priorityLabel(candidate.priority as PriorityLevel)}
                                          </span>
                                          <span className={`inline-flex px-1 py-0.5 rounded text-[10px] ${sb.className}`}>
                                            {sb.label}
                                          </span>
                                          <span className={`text-[10px] ${candidate.confidence === "high" ? "text-green-600" : "text-yellow-600"}`}>
                                            {candidate.confidence}
                                          </span>
                                          <span className="text-gray-400 text-[10px]">{candidate.reason}</span>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => linkItem(category, idx, candidate)}
                                        className={`flex-shrink-0 transition-colors ${
                                          isLinked ? "text-green-600" : "text-gray-300 hover:text-green-600"
                                        }`}
                                        title="Link as update"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      </button>
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
                                  );
                                })}
                              </div>
                            );
                          })()
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
                                onClick={() => acceptItem(category, idx)}
                                className={`transition-colors ${
                                  item._accepted === true
                                    ? "text-green-600"
                                    : "text-gray-300 hover:text-green-600"
                                }`}
                                title="Accept"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </button>
                              <button
                                onClick={() => rejectItem(category, idx)}
                                className={`transition-colors ${
                                  item._accepted === false
                                    ? "text-red-500"
                                    : "text-gray-300 hover:text-red-500"
                                }`}
                                title="Reject"
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
                    ))}
                  </div>
                </div>
              )
          )}

          {totalItems === 0 && (
            <p className="text-sm text-gray-500">
              No entities were extracted from the text.
            </p>
          )}
        </div>
      </div>

      {totalAccepted > 0 && (
        <div className="fixed bottom-0 left-0 md:left-56 right-0 bg-gray-50 border-t border-gray-200 px-6 py-4 z-10">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {totalLinked > 0
                ? `${totalNew} new, ${totalLinked} update${totalLinked !== 1 ? "s" : ""}`
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

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { priorityColor } from "@/lib/utils";
import type { Intake, PriorityLevel, Vendor, Project, Person } from "@/lib/types";

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
  source_quote?: string | null;
  // Per-item overrides
  _accepted?: boolean;
  _edited?: boolean;
  _editing?: boolean;
  _project_id?: string | null;
  _vendor_id?: string | null;
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

const categoryColors: Record<EntityCategory, string> = {
  action_items: "border-blue-200 bg-blue-50",
  decisions: "border-purple-200 bg-purple-50",
  issues: "border-orange-200 bg-orange-50",
  risks: "border-yellow-200 bg-yellow-50",
  blockers: "border-red-200 bg-red-50",
  status_updates: "border-gray-200 bg-gray-50",
};

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
    { field: "priority", label: "Priority", type: "select" },
    { field: "impact", label: "Impact", type: "textarea" },
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
  const lowerQuote = quote.toLowerCase();
  const idx = lowerText.indexOf(lowerQuote);
  if (idx === -1) return text;

  const before = text.substring(0, idx);
  const match = text.substring(idx, idx + quote.length);
  const after = text.substring(idx + quote.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

export default function IntakeReviewPage() {
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
  const rawTextRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const scrollToSource = useCallback((quote: string | null | undefined) => {
    if (!quote || !rawTextRef.current || !intake) return;

    // Clear first so re-clicking the same quote still triggers a re-render
    setHighlightedQuote(null);

    requestAnimationFrame(() => {
      setHighlightedQuote(quote);

      const container = rawTextRef.current;
      if (!container) return;

      const text = intake.raw_text;
      const lowerText = text.toLowerCase();
      const lowerQuote = quote.toLowerCase();
      const matchIndex = lowerText.indexOf(lowerQuote);

      if (matchIndex === -1) return;

      // Scroll the container to roughly the right position
      const textBefore = text.substring(0, matchIndex);
      const linesBefore = textBefore.split("\n").length - 1;
      const lineHeight = 20;
      const scrollTarget = linesBefore * lineHeight - container.clientHeight / 3;
      container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });

      // Auto-clear highlight after 4 seconds
      setTimeout(() => setHighlightedQuote(null), 4000);
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

        setExtracted({
          action_items: (ed.action_items || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          decisions: (ed.decisions || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          issues: (ed.issues || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          risks: (ed.risks || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          blockers: (ed.blockers || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          status_updates: (ed.status_updates || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: undefined,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
        });
      }

      setLoading(false);
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

  function toggleEdit(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _editing: !item._editing } : item
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

  async function handleConfirm() {
    if (!intake) return;
    setConfirming(true);
    setError(null);

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org found");

      // Get people for fuzzy matching owner names
      const { data: existingPeople } = await supabase
        .from("people")
        .select("id, full_name")
        .eq("org_id", orgId);

      const peopleMap = new Map(
        (existingPeople || []).map((p: { id: string; full_name: string }) => [
          p.full_name.toLowerCase(),
          p.id,
        ])
      );

      // Collect all owner names from accepted items that need person records
      const allOwnerNames = new Set<string>();
      for (const [cat, items] of Object.entries(extracted)) {
        for (const item of items) {
          const name = cat === "decisions" ? item.made_by : item.owner_name;
          if (name && name.trim()) allOwnerNames.add(name.trim());
        }
      }

      // Create missing people
      for (const name of allOwnerNames) {
        const lower = name.toLowerCase();
        let found = false;
        if (peopleMap.has(lower)) { found = true; }
        if (!found) {
          for (const [fullName] of peopleMap) {
            if (fullName.includes(lower) || lower.includes(fullName)) { found = true; break; }
            const parts = fullName.split(" ");
            if (parts.some((part) => part === lower)) { found = true; break; }
          }
        }
        if (!found) {
          const { data: newPerson, error: personErr } = await supabase
            .from("people")
            .insert({ full_name: name, org_id: orgId, is_internal: false })
            .select("id, full_name")
            .single();
          if (personErr) throw new Error(`Failed to create person "${name}": ${personErr.message}`);
          if (newPerson) {
            peopleMap.set(newPerson.full_name.toLowerCase(), newPerson.id);
          }
        }
      }

      function findPersonId(name: string | null | undefined): string | null {
        if (!name) return null;
        const lower = name.trim().toLowerCase();
        if (peopleMap.has(lower)) return peopleMap.get(lower)!;
        for (const [fullName, id] of peopleMap) {
          if (fullName.includes(lower) || lower.includes(fullName)) return id;
          const parts = fullName.split(" ");
          if (parts.some((part) => part === lower)) return id;
        }
        return null;
      }

      const errors: string[] = [];

      // Create accepted action items
      const acceptedActions = extracted.action_items.filter((i) => i._accepted === true);
      if (acceptedActions.length > 0) {
        const { error: err } = await supabase.from("action_items").insert(
          acceptedActions.map((item) => ({
            org_id: orgId,
            title: item.title,
            owner_id: findPersonId(item.owner_name),
            vendor_id: item._vendor_id || null,
            project_id: item._project_id || null,
            priority: item.priority || "medium",
            due_date: item.due_date || null,
            notes: item.notes || null,
          }))
        );
        if (err) errors.push(`Action items: ${err.message}`);
      }

      // Create accepted decisions as RAID entries
      const acceptedDecisions = extracted.decisions.filter((i) => i._accepted === true);
      if (acceptedDecisions.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "decision");

        const { error: err } = await supabase.from("raid_entries").insert(
          acceptedDecisions.map((item, idx) => ({
            org_id: orgId,
            raid_type: "decision" as const,
            display_id: `D${(count || 0) + idx + 1}`,
            title: item.title,
            description: item.rationale || null,
            owner_id: findPersonId(item.made_by),
            project_id: item._project_id || null,
            decision_date: item.decision_date || null,
            priority: "medium" as const,
          }))
        );
        if (err) errors.push(`Decisions: ${err.message}`);
      }

      // Create accepted issues as RAID entries
      const acceptedIssues = extracted.issues.filter((i) => i._accepted === true);
      if (acceptedIssues.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "issue");

        const { error: err } = await supabase.from("raid_entries").insert(
          acceptedIssues.map((item, idx) => ({
            org_id: orgId,
            raid_type: "issue" as const,
            display_id: `I${(count || 0) + idx + 1}`,
            title: item.title,
            impact: item.impact || null,
            priority: item.priority || "medium",
            owner_id: findPersonId(item.owner_name),
            project_id: item._project_id || null,
            vendor_id: item._vendor_id || null,
          }))
        );
        if (err) errors.push(`Issues: ${err.message}`);
      }

      // Create accepted risks as RAID entries
      const acceptedRisks = extracted.risks.filter((i) => i._accepted === true);
      if (acceptedRisks.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "risk");

        const { error: err } = await supabase.from("raid_entries").insert(
          acceptedRisks.map((item, idx) => ({
            org_id: orgId,
            raid_type: "risk" as const,
            display_id: `R${(count || 0) + idx + 1}`,
            title: item.title,
            impact: item.impact || null,
            description: item.mitigation || null,
            priority: item.priority || "medium",
            project_id: item._project_id || null,
          }))
        );
        if (err) errors.push(`Risks: ${err.message}`);
      }

      // Create accepted blockers
      const acceptedBlockers = extracted.blockers.filter((i) => i._accepted === true);
      if (acceptedBlockers.length > 0) {
        const { error: err } = await supabase.from("blockers").insert(
          acceptedBlockers.map((item) => ({
            org_id: orgId,
            title: item.title,
            impact_description: item.impact_description || null,
            owner_id: findPersonId(item.owner_name),
            vendor_id: item._vendor_id || null,
            project_id: item._project_id || null,
            priority: item.priority || "high",
          }))
        );
        if (err) errors.push(`Blockers: ${err.message}`);
      }

      if (errors.length > 0) {
        throw new Error(`Some items failed to save:\n${errors.join("\n")}`);
      }

      router.push("/dashboard");
    } catch (err) {
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
  const totalAccepted = Object.values(extracted).flat().filter((i) => i._accepted === true).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
        {/* Raw text */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Original Text
          </h2>
          <div ref={rawTextRef} className="bg-white rounded-lg border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{highlightedQuote ? renderHighlightedText(intake.raw_text, highlightedQuote) : intake.raw_text}</pre>
          </div>
        </div>

        {/* Extracted entities */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Extracted Entities
          </h2>

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
                            {categoryFields[category].map((fieldDef) => {
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
                                        <option key={p} value={p}>{p}</option>
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
                                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
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
                                              updateItem(category, idx, fieldDef.field, val || " ");
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
                              {item.made_by && (
                                <span className="text-xs text-gray-500">By: {item.made_by}</span>
                              )}
                              {item.priority && (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(item.priority)}`}>
                                  {item.priority}
                                </span>
                              )}
                              {item.new_status && (
                                <span className="inline-flex px-1.5 py-0.5 text-xs rounded border border-gray-300 bg-gray-100 text-gray-700">
                                  {item.new_status.replace(/_/g, " ")}
                                </span>
                              )}
                              {(item.due_date || item.decision_date) && (
                                <span className="text-xs text-gray-500">
                                  {item.due_date ? `Due: ${item.due_date}` : `Date: ${item.decision_date}`}
                                </span>
                              )}
                            </div>
                            {(item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation) && (
                              <p className="text-xs text-gray-600 mt-1">
                                {item.notes || item.impact || item.impact_description || item.rationale || item.details || item.mitigation}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end items-center gap-2 mt-1">
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
                            onClick={() => toggleEdit(category, idx)}
                            className={`transition-colors ${
                              item._editing
                                ? "text-blue-600 hover:text-blue-800"
                                : "text-gray-400 hover:text-blue-600"
                            }`}
                            title={item._editing ? "Done editing" : "Edit"}
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
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-6 px-6 py-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {totalAccepted} items will be created
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
                {confirming ? "Creating..." : `Confirm ${totalAccepted} Items`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

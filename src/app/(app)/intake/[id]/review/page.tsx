"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import { priorityColor } from "@/lib/utils";
import type { Intake, PriorityLevel, Vendor, Project } from "@/lib/types";

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

    // Clear any existing highlight
    setHighlightedQuote(quote);

    const container = rawTextRef.current;
    const text = intake.raw_text;
    const lowerText = text.toLowerCase();
    const lowerQuote = quote.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerQuote);

    if (matchIndex === -1) return;

    // Find the text node and scroll to it using a temporary mark
    // We'll use window.find or a range-based approach
    const pre = container.querySelector("pre");
    if (!pre) return;

    // Scroll the container to roughly the right position
    const textBefore = text.substring(0, matchIndex);
    const linesBefore = textBefore.split("\n").length - 1;
    const lineHeight = 20; // approximate line height for text-sm mono
    const scrollTarget = linesBefore * lineHeight - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });

    // Auto-clear highlight after 4 seconds
    setTimeout(() => setHighlightedQuote(null), 4000);
  }, [intake]);

  useEffect(() => {
    async function loadData() {
      const [{ data: intakeData, error: intakeErr }, { data: v }, { data: p }] =
        await Promise.all([
          supabase.from("intakes").select("*").eq("id", intakeId).single(),
          supabase.from("vendors").select("*").order("name"),
          supabase.from("projects").select("*").order("name"),
        ]);

      if (intakeErr || !intakeData) {
        setError("Intake not found");
        setLoading(false);
        return;
      }

      setIntake(intakeData as Intake);
      setVendors((v || []) as Vendor[]);
      setProjects((p || []) as Project[]);

      if (intakeData.extracted_data) {
        const ed = intakeData.extracted_data as Record<string, ExtractedItem[]>;
        const defaultProjectId = intakeData.project_id || null;
        const defaultVendorId = intakeData.vendor_id || null;

        setExtracted({
          action_items: (ed.action_items || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          decisions: (ed.decisions || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          issues: (ed.issues || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          risks: (ed.risks || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          blockers: (ed.blockers || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
          status_updates: (ed.status_updates || []).map((i: ExtractedItem) => ({
            ...i,
            _accepted: false,
            _project_id: defaultProjectId,
            _vendor_id: defaultVendorId,
          })),
        });
      }

      setLoading(false);
    }
    loadData();
  }, [intakeId]);

  function toggleAccept(category: EntityCategory, index: number) {
    setExtracted((prev) => ({
      ...prev,
      [category]: prev[category].map((item, i) =>
        i === index ? { ...item, _accepted: !item._accepted } : item
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
      const { data: people } = await supabase
        .from("people")
        .select("id, full_name")
        .eq("org_id", orgId);

      const peopleMap = new Map(
        (people || []).map((p: { id: string; full_name: string }) => [
          p.full_name.toLowerCase(),
          p.id,
        ])
      );

      function findPersonId(name: string | null | undefined): string | null {
        if (!name) return null;
        const lower = name.toLowerCase();
        if (peopleMap.has(lower)) return peopleMap.get(lower)!;
        for (const [fullName, id] of peopleMap) {
          if (fullName.includes(lower) || lower.includes(fullName)) return id;
          const parts = fullName.split(" ");
          if (parts.some((part) => part === lower)) return id;
        }
        return null;
      }

      // Create accepted action items
      const acceptedActions = extracted.action_items.filter((i) => i._accepted);
      if (acceptedActions.length > 0) {
        await supabase.from("action_items").insert(
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
      }

      // Create accepted decisions as RAID entries
      const acceptedDecisions = extracted.decisions.filter((i) => i._accepted);
      if (acceptedDecisions.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "decision");

        await supabase.from("raid_entries").insert(
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
      }

      // Create accepted issues as RAID entries
      const acceptedIssues = extracted.issues.filter((i) => i._accepted);
      if (acceptedIssues.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "issue");

        await supabase.from("raid_entries").insert(
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
      }

      // Create accepted risks as RAID entries
      const acceptedRisks = extracted.risks.filter((i) => i._accepted);
      if (acceptedRisks.length > 0) {
        const { count } = await supabase
          .from("raid_entries")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("raid_type", "risk");

        await supabase.from("raid_entries").insert(
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
      }

      // Create accepted blockers
      const acceptedBlockers = extracted.blockers.filter((i) => i._accepted);
      if (acceptedBlockers.length > 0) {
        await supabase.from("blockers").insert(
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

  const totalAccepted = Object.values(extracted).flat().filter((i) => i._accepted).length;
  const totalItems = Object.values(extracted).flat().length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Review Extraction</h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalItems} items extracted. Click the checkmark to accept items. {totalAccepted} accepted so far.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Raw text */}
        <div className="lg:sticky lg:top-0">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Original Text
          </h2>
          <div ref={rawTextRef} className="bg-white rounded-lg border border-gray-200 p-4 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
              {highlightedQuote ? renderHighlightedText(intake.raw_text, highlightedQuote) : intake.raw_text}
            </pre>
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
                    {categoryLabels[category]} ({items.filter((i) => i._accepted).length}/{items.length})
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 transition-all ${
                          item._accepted
                            ? "border-green-300 bg-green-50"
                            : categoryColors[category]
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={item.title || item.subject || ""}
                              onChange={(e) =>
                                updateItem(category, idx, item.subject !== undefined ? "subject" : "title", e.target.value)
                              }
                              className="w-full text-sm font-medium text-gray-900 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                            />
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {item.owner_name && (
                                <span className="text-xs text-gray-500">
                                  Owner: {item.owner_name}
                                </span>
                              )}
                              {item.priority && (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${priorityColor(item.priority)}`}>
                                  {item.priority}
                                </span>
                              )}
                              {item.due_date && (
                                <span className="text-xs text-gray-500">
                                  Due: {item.due_date}
                                </span>
                              )}
                            </div>
                            {(item.notes || item.impact || item.rationale || item.details) && (
                              <p className="text-xs text-gray-600 mt-1">
                                {item.notes || item.impact || item.rationale || item.details}
                              </p>
                            )}

                            {/* Per-item project/vendor assignment */}
                            {item._accepted && category !== "status_updates" && (
                              <div className="flex gap-2 mt-2">
                                <select
                                  value={item._project_id || ""}
                                  onChange={(e) =>
                                    updateItem(category, idx, "_project_id", e.target.value || "")
                                  }
                                  className="flex-1 text-xs rounded border border-gray-300 px-1.5 py-1 bg-white focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="">No project</option>
                                  {projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={item._vendor_id || ""}
                                  onChange={(e) =>
                                    updateItem(category, idx, "_vendor_id", e.target.value || "")
                                  }
                                  className="flex-1 text-xs rounded border border-gray-300 px-1.5 py-1 bg-white focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="">No vendor</option>
                                  {vendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
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
                            onClick={() => toggleAccept(category, idx)}
                            className={`transition-colors ${
                              item._accepted
                                ? "text-green-600 hover:text-red-400"
                                : "text-gray-300 hover:text-green-600"
                            }`}
                            title={item._accepted ? "Click to reject" : "Click to accept"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
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

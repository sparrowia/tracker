"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { priorityColor } from "@/lib/utils";
import type { Vendor, Project, PriorityLevel } from "@/lib/types";

type ItemType = "action_items" | "decisions" | "issues" | "risks" | "blockers" | "status_updates";

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: "action_items", label: "Action Items" },
  { value: "decisions", label: "Decisions" },
  { value: "issues", label: "Issues" },
  { value: "risks", label: "Risks" },
  { value: "blockers", label: "Blockers" },
  { value: "status_updates", label: "Status Updates" },
];

const TARGET_FIELDS: Record<ItemType, { value: string; label: string }[]> = {
  action_items: [
    { value: "title", label: "Title" },
    { value: "owner_name", label: "Owner" },
    { value: "priority", label: "Priority" },
    { value: "due_date", label: "Due Date" },
    { value: "notes", label: "Notes" },
  ],
  decisions: [
    { value: "title", label: "Decision Title" },
    { value: "made_by", label: "Made By" },
    { value: "decision_date", label: "Decision Date" },
    { value: "rationale", label: "Rationale" },
  ],
  issues: [
    { value: "title", label: "Issue Title" },
    { value: "owner_name", label: "Owner" },
    { value: "priority", label: "Priority" },
    { value: "date_reported", label: "Date Reported" },
    { value: "impact", label: "Impact" },
    { value: "attachments", label: "Screenshots/Videos" },
    { value: "notes", label: "Notes" },
    { value: "updates", label: "Updates" },
  ],
  risks: [
    { value: "title", label: "Risk Title" },
    { value: "priority", label: "Priority" },
    { value: "impact", label: "Impact" },
    { value: "mitigation", label: "Mitigation" },
  ],
  blockers: [
    { value: "title", label: "Blocker Title" },
    { value: "owner_name", label: "Owner" },
    { value: "priority", label: "Priority" },
    { value: "impact_description", label: "Impact" },
  ],
  status_updates: [
    { value: "subject", label: "Subject" },
    { value: "new_status", label: "New Status" },
    { value: "details", label: "Details" },
  ],
};

// The required field that must be mapped for each type
const REQUIRED_FIELD: Record<ItemType, string> = {
  action_items: "title",
  decisions: "title",
  issues: "title",
  risks: "title",
  blockers: "title",
  status_updates: "subject",
};

// Fields that allow multiple source columns to map to them (concatenated as paragraphs)
const MULTI_MAP_FIELDS = new Set(["notes", "updates"]);

interface ColumnMapping {
  source_column: string;
  target_field: string | null;
  confidence: "high" | "medium" | "low";
}

interface SessionData {
  fileName: string;
  sheets: { name: string; headers: string[]; rows: string[][] }[];
  activeSheet: number;
  vendorId: string;
  projectId: string;
  newVendorName: string;
  newProjectName: string;
}

function normalizePriority(val: string): PriorityLevel | null {
  const v = val.toLowerCase().trim();
  if (["critical", "urgent", "p0", "p1"].some((k) => v.includes(k))) return "critical";
  if (["high", "important", "p2"].some((k) => v.includes(k))) return "high";
  if (["medium", "med", "normal", "moderate", "p3"].some((k) => v.includes(k))) return "medium";
  if (["low", "minor", "p4", "p5"].some((k) => v.includes(k))) return "low";
  return null;
}

function normalizeDate(val: string): string | null {
  if (!val) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Try Date parse
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return null;
}

function normalizeStatus(val: string): string | null {
  const v = val.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const valid = ["pending", "in_progress", "complete", "needs_verification", "paused", "at_risk", "blocked"];
  if (valid.includes(v)) return v;
  // Fuzzy
  if (v.includes("progress") || v.includes("active") || v.includes("working")) return "in_progress";
  if (v.includes("done") || v.includes("complete") || v.includes("finish") || v.includes("closed")) return "complete";
  if (v.includes("block")) return "blocked";
  if (v.includes("risk")) return "at_risk";
  if (v.includes("pause") || v.includes("hold")) return "paused";
  if (v.includes("verify") || v.includes("review")) return "needs_verification";
  if (v.includes("open") || v.includes("new") || v.includes("todo") || v.includes("to_do")) return "pending";
  return null;
}

export default function IntakeSetupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [itemType, setItemType] = useState<ItemType>("action_items");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [aiReasoning, setAiReasoning] = useState("");
  const [aiConfidence, setAiConfidence] = useState<"high" | "medium" | "low">("low");
  const [mappingLoading, setMappingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Load session data + reference data
  useEffect(() => {
    const raw = sessionStorage.getItem("spreadsheet_intake");
    if (!raw) {
      router.push("/intake");
      return;
    }
    try {
      const data = JSON.parse(raw) as SessionData;
      setSessionData(data);
      setActiveSheetIdx(data.activeSheet || 0);
    } catch {
      router.push("/intake");
    }

    async function loadRefData() {
      const [{ data: v }, { data: p }] = await Promise.all([
        supabase.from("vendors").select("*").order("name"),
        supabase.from("projects").select("*").order("name"),
      ]);
      setVendors((v || []) as Vendor[]);
      setProjects((p || []) as Project[]);
    }
    loadRefData();
  }, []);

  const activeSheet = sessionData?.sheets[activeSheetIdx];
  const headers = activeSheet?.headers || [];
  const rows = activeSheet?.rows || [];

  // Request AI mapping when sheet changes
  useEffect(() => {
    if (!headers.length) return;
    requestMapping(headers, rows.slice(0, 5));
  }, [activeSheetIdx, sessionData]);

  async function requestMapping(hdrs: string[], sampleRows: string[][]) {
    setMappingLoading(true);
    try {
      const res = await fetch("/api/extract/suggest-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: hdrs, sample_rows: sampleRows }),
      });
      if (res.ok) {
        const data = await res.json();
        setItemType(data.suggested_type || "action_items");
        setAiReasoning(data.reasoning || "");
        setAiConfidence(data.confidence || "low");
        setMappings(
          data.mappings?.map((m: ColumnMapping) => ({
            source_column: m.source_column,
            target_field: m.target_field || null,
            confidence: m.confidence || "low",
          })) || hdrs.map((h) => ({ source_column: h, target_field: null, confidence: "low" as const }))
        );
      } else {
        // Initialize empty mappings
        setMappings(hdrs.map((h) => ({ source_column: h, target_field: null, confidence: "low" as const })));
      }
    } catch {
      setMappings(hdrs.map((h) => ({ source_column: h, target_field: null, confidence: "low" as const })));
    } finally {
      setMappingLoading(false);
    }
  }

  // When item type changes, clear mappings that aren't valid for the new type
  function handleTypeChange(newType: ItemType) {
    const validFields = TARGET_FIELDS[newType].map((f) => f.value);
    setItemType(newType);
    setMappings((prev) =>
      prev.map((m) => ({
        ...m,
        target_field: m.target_field && validFields.includes(m.target_field) ? m.target_field : null,
        confidence: "low" as const,
      }))
    );
  }

  function handleMappingChange(index: number, newField: string | null) {
    setMappings((prev) => {
      const updated = [...prev];
      // Clear any other mapping that uses this field (prevent duplicates)
      // Exception: multi-map fields (notes, updates) allow multiple columns
      if (newField && !MULTI_MAP_FIELDS.has(newField)) {
        for (let i = 0; i < updated.length; i++) {
          if (i !== index && updated[i].target_field === newField) {
            updated[i] = { ...updated[i], target_field: null, confidence: "low" };
          }
        }
      }
      updated[index] = { ...updated[index], target_field: newField, confidence: "high" };
      return updated;
    });
  }

  function handleSheetChange(idx: number) {
    setActiveSheetIdx(idx);
  }

  // Check if required field is mapped
  const requiredField = REQUIRED_FIELD[itemType];
  const hasTitleMapped = mappings.some((m) => m.target_field === requiredField);

  // Count usable rows (have a value in the title-mapped column)
  const titleColIndex = mappings.findIndex((m) => m.target_field === requiredField);
  const usableRowCount = titleColIndex >= 0
    ? rows.filter((r) => r[titleColIndex]?.trim()).length
    : rows.length;

  // Build preview rows (multi-map fields get concatenated with paragraph breaks)
  const previewRows = useMemo(() => {
    const sample = rows.slice(0, 5);
    return sample.map((row) => {
      const mapped: Record<string, string> = {};
      mappings.forEach((m, i) => {
        if (m.target_field && row[i] !== undefined && row[i] !== "") {
          let val = row[i];
          if (m.target_field === "priority") {
            val = normalizePriority(val) || val;
          } else if (["due_date", "decision_date", "date_reported"].includes(m.target_field)) {
            val = normalizeDate(val) || val;
          } else if (m.target_field === "new_status") {
            val = normalizeStatus(val) || val;
          }
          // Multi-map fields: concatenate with paragraph break
          if (MULTI_MAP_FIELDS.has(m.target_field) && mapped[m.target_field]) {
            mapped[m.target_field] += `\n\n${val}`;
          } else {
            mapped[m.target_field] = val;
          }
        }
      });
      return mapped;
    });
  }, [mappings, rows]);

  async function handleImport() {
    if (!sessionData || !activeSheet) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.user?.id)
        .single();

      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org found");

      // Resolve vendor
      let resolvedVendorId: string | null = null;
      if (sessionData.vendorId === "new" && sessionData.newVendorName?.trim()) {
        const { data: newVendor, error: vendorErr } = await supabase
          .from("vendors")
          .insert({ name: sessionData.newVendorName.trim(), org_id: orgId })
          .select()
          .single();
        if (vendorErr) throw vendorErr;
        resolvedVendorId = newVendor.id;
      } else if (sessionData.vendorId && sessionData.vendorId !== "none" && sessionData.vendorId !== "") {
        resolvedVendorId = sessionData.vendorId;
      }

      // Resolve project
      let resolvedProjectId: string | null = null;
      if (sessionData.projectId === "new" && sessionData.newProjectName?.trim()) {
        const slug = sessionData.newProjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const { data: newProject, error: projectErr } = await supabase
          .from("projects")
          .insert({ name: sessionData.newProjectName.trim(), slug, org_id: orgId })
          .select()
          .single();
        if (projectErr) throw projectErr;
        resolvedProjectId = newProject.id;
      } else if (sessionData.projectId && sessionData.projectId !== "none" && sessionData.projectId !== "") {
        resolvedProjectId = sessionData.projectId;
      }

      // Transform rows into extracted_data format
      const items = rows
        .map((row) => {
          const item: Record<string, string | null> = {};
          mappings.forEach((m, i) => {
            if (m.target_field && row[i] !== undefined && row[i] !== "") {
              let val = row[i];
              if (m.target_field === "priority") {
                val = normalizePriority(val) || "medium";
              } else if (["due_date", "decision_date", "date_reported"].includes(m.target_field)) {
                val = normalizeDate(val) || val;
              } else if (m.target_field === "new_status") {
                val = normalizeStatus(val) || val;
              }
              // Multi-map fields: concatenate with paragraph break
              if (MULTI_MAP_FIELDS.has(m.target_field) && item[m.target_field]) {
                item[m.target_field] += `\n\n${val}`;
              } else {
                item[m.target_field] = val;
              }
            }
          });
          return item;
        })
        .filter((item) => {
          const titleField = requiredField;
          return item[titleField]?.trim();
        });

      if (items.length === 0) {
        throw new Error("No valid rows found after applying mappings");
      }

      const extractedData: Record<string, Record<string, string | null>[]> = {
        action_items: [],
        decisions: [],
        issues: [],
        risks: [],
        blockers: [],
        status_updates: [],
      };
      extractedData[itemType] = items;

      // Create intake record
      const { data: intake, error: insertError } = await supabase
        .from("intakes")
        .insert({
          raw_text: `Imported ${items.length} rows from ${sessionData.fileName}`,
          source: "spreadsheet",
          vendor_id: resolvedVendorId,
          project_id: resolvedProjectId,
          submitted_by: user.user?.id || null,
          org_id: orgId,
          extraction_status: "complete",
          extracted_data: extractedData,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Clean up session storage
      sessionStorage.removeItem("spreadsheet_intake");

      router.push(`/intake/${intake.id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (!sessionData) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  const availableFields = TARGET_FIELDS[itemType];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Set Up Import</h1>
        <div className="flex items-center gap-3 mt-1">
          <p className="text-sm text-gray-500">
            {sessionData.fileName} — {usableRowCount} rows
          </p>
          {sessionData.sheets.length > 1 && (
            <select
              value={activeSheetIdx}
              onChange={(e) => handleSheetChange(Number(e.target.value))}
              className="text-sm rounded border border-gray-300 px-2 py-0.5 focus:border-blue-500 focus:outline-none"
            >
              {sessionData.sheets.map((s, i) => (
                <option key={i} value={i}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Item Type */}
      <div>
        <div className="bg-gray-800 text-white text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-t">
          Item Type
        </div>
        <div className="border border-t-0 border-gray-300 rounded-b p-4 bg-white">
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-700 font-medium">Import rows as:</label>
            <select
              value={itemType}
              onChange={(e) => handleTypeChange(e.target.value as ItemType)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {aiReasoning && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                  aiConfidence === "high" ? "bg-green-100 text-green-700" :
                  aiConfidence === "medium" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {aiConfidence}
                </span>
                <span className="text-xs text-gray-500">{aiReasoning}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column Mapping */}
      <div>
        <div className="bg-gray-800 text-white text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-t">
          Column Mapping
        </div>
        <div className="border border-t-0 border-gray-300 rounded-b bg-white">
          {mappingLoading ? (
            <div className="flex items-center gap-3 p-4">
              <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              <span className="text-sm text-gray-600">AI is analyzing your columns...</span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-300">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2 w-8"></th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Source Column</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Sample Values</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Maps To</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, i) => {
                  const samples = rows.slice(0, 3).map((r) => r[i]).filter(Boolean);
                  return (
                    <tr key={i} className="border-b border-gray-200 last:border-b-0">
                      <td className="px-4 py-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          mapping.target_field === null ? "bg-gray-300" :
                          mapping.confidence === "high" ? "bg-green-500" :
                          "bg-yellow-500"
                        }`} />
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {mapping.source_column}
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">
                        {samples.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping.target_field || ""}
                          onChange={(e) => handleMappingChange(i, e.target.value || null)}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">Skip</option>
                          {availableFields.map((f) => {
                            const inUse = mappings.some((m, j) => j !== i && m.target_field === f.value);
                            const isMulti = MULTI_MAP_FIELDS.has(f.value);
                            return (
                              <option key={f.value} value={f.value}>
                                {f.label}{inUse && isMulti ? " (add another)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Preview */}
      <div>
        <div className="bg-gray-800 text-white text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-t">
          Preview (First 5 Rows)
        </div>
        <div className="border border-t-0 border-gray-300 rounded-b bg-white overflow-x-auto">
          {previewRows.length > 0 && mappings.some((m) => m.target_field) ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-300">
                  {availableFields
                    .filter((f) => mappings.some((m) => m.target_field === f.value))
                    .map((f) => (
                      <th key={f.value} className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">
                        {f.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-200 last:border-b-0">
                    {availableFields
                      .filter((f) => mappings.some((m) => m.target_field === f.value))
                      .map((f) => {
                        const val = row[f.value] || "";
                        if (f.value === "priority" && val) {
                          const p = val as PriorityLevel;
                          const colors = ["critical", "high", "medium", "low"].includes(p) ? priorityColor(p) : "";
                          return (
                            <td key={f.value} className="px-4 py-2">
                              {colors ? (
                                <span className={`inline-flex px-1.5 py-0.5 text-xs rounded border ${colors}`}>{p}</span>
                              ) : (
                                <span className="text-gray-400">{val}</span>
                              )}
                            </td>
                          );
                        }
                        return (
                          <td key={f.value} className="px-4 py-2 text-gray-700">
                            {val || <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-gray-500">Map at least one column to see a preview.</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-6 px-6 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              {usableRowCount} rows will be imported as {TYPE_OPTIONS.find((t) => t.value === itemType)?.label}
            </p>
            {!hasTitleMapped && (
              <p className="text-xs text-red-600 mt-0.5">
                Map a column to &quot;{requiredField === "subject" ? "Subject" : "Title"}&quot; to enable import
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                sessionStorage.removeItem("spreadsheet_intake");
                router.push("/intake");
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!hasTitleMapped || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Importing..." : "Import & Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Vendor, Project, IntakeSource } from "@/lib/types";

const sourceOptions: { value: IntakeSource; label: string }[] = [
  { value: "slack", label: "Slack Message" },
  { value: "email", label: "Email" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "fathom_transcript", label: "Fathom Transcript" },
  { value: "manual", label: "Manual Entry" },
];

export default function IntakePage() {
  const [rawText, setRawText] = useState("");
  const [source, setSource] = useState<IntakeSource>("manual");
  const [vendorId, setVendorId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const [{ data: v }, { data: p }] = await Promise.all([
        supabase.from("vendors").select("*").order("name"),
        supabase.from("projects").select("*").order("name"),
      ]);
      setVendors((v || []) as Vendor[]);
      setProjects((p || []) as Project[]);
    }
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.user?.id)
        .single();

      let resolvedVendorId: string | null = null;
      let resolvedProjectId: string | null = null;

      // Create new vendor if needed
      if (vendorId === "new" && newVendorName.trim()) {
        const { data: newVendor, error: vendorErr } = await supabase
          .from("vendors")
          .insert({ name: newVendorName.trim(), org_id: profile?.org_id })
          .select()
          .single();
        if (vendorErr) throw vendorErr;
        resolvedVendorId = newVendor.id;
      } else if (vendorId && vendorId !== "none") {
        resolvedVendorId = vendorId;
      }

      // Create new project if needed
      if (projectId === "new" && newProjectName.trim()) {
        const slug = newProjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const { data: newProject, error: projectErr } = await supabase
          .from("projects")
          .insert({
            name: newProjectName.trim(),
            slug,
            org_id: profile?.org_id,
          })
          .select()
          .single();
        if (projectErr) throw projectErr;
        resolvedProjectId = newProject.id;
      } else if (projectId && projectId !== "none") {
        resolvedProjectId = projectId;
      }

      const { data: intake, error: insertError } = await supabase
        .from("intakes")
        .insert({
          raw_text: rawText.trim(),
          source,
          vendor_id: resolvedVendorId,
          project_id: resolvedProjectId,
          submitted_by: user.user?.id || null,
          org_id: profile?.org_id,
          extraction_status: "processing",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_id: intake.id,
          raw_text: rawText.trim(),
          vendor_id: resolvedVendorId,
          project_id: resolvedProjectId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Extraction failed");
      }

      router.push(`/intake/${intake.id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Intake</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paste raw text from Slack, email, or meeting notes. DeepSeek will extract action items, decisions, issues, and more.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source
          </label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as IntakeSource)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {sourceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor (optional)
            </label>
            <select
              value={vendorId}
              onChange={(e) => {
                setVendorId(e.target.value);
                if (e.target.value !== "new") setNewVendorName("");
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any / Auto-detect</option>
              <option value="none">None</option>
              <option value="new">+ New Vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            {vendorId === "new" && (
              <input
                type="text"
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                placeholder="Vendor name"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project (optional)
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                if (e.target.value !== "new") setNewProjectName("");
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any / Auto-detect</option>
              <option value="none">None</option>
              <option value="new">+ New Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {projectId === "new" && (
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Raw Text
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            required
            placeholder="Paste Slack message, email, meeting notes, or any text here..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !rawText.trim()}
          className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Extracting..." : "Extract with DeepSeek"}
        </button>
      </form>
    </div>
  );
}

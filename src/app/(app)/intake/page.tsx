"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Vendor, Project, IntakeSource } from "@/lib/types";

interface PastedImage {
  id: string;
  dataUrl: string;
  file: File;
}

const sourceOptions: { value: IntakeSource; label: string }[] = [
  { value: "slack", label: "Slack Message" },
  { value: "email", label: "Email" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "fathom_transcript", label: "Fathom Transcript" },
  { value: "manual", label: "Manual Entry" },
];

export default function IntakePage() {
  const [rawText, setRawText] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [source, setSource] = useState<IntakeSource>("manual");
  const [vendorId, setVendorId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState("");
  const [elapsed, setElapsed] = useState(0);
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

  const addImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPastedImages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), dataUrl, file },
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  // Global paste listener — catches image paste regardless of focus target
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const clipboardData = e.clipboardData;
      console.log("[paste] event fired", clipboardData);
      if (!clipboardData) {
        console.log("[paste] no clipboardData");
        return;
      }

      // Log what's in the clipboard
      console.log("[paste] items count:", clipboardData.items?.length);
      console.log("[paste] files count:", clipboardData.files?.length);
      if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          console.log("[paste] item", i, "kind:", clipboardData.items[i].kind, "type:", clipboardData.items[i].type);
        }
      }
      if (clipboardData.files) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          console.log("[paste] file", i, "type:", clipboardData.files[i].type, "size:", clipboardData.files[i].size);
        }
      }

      // Check items (Chrome, Edge, modern browsers)
      if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            console.log("[paste] got image file from items:", file);
            if (file) addImageFile(file);
            return;
          }
        }
      }

      // Fallback: check files (Safari, older browsers)
      if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const file = clipboardData.files[i];
          if (file.type.startsWith("image/")) {
            e.preventDefault();
            console.log("[paste] got image file from files:", file);
            addImageFile(file);
            return;
          }
        }
      }

      console.log("[paste] no image found in clipboard");
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addImageFile]);

  function removeImage(id: string) {
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  }

  async function ocrImages(images: PastedImage[]): Promise<string> {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const texts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      setProgressStep(`Reading image ${i + 1} of ${images.length}...`);
      const { data } = await worker.recognize(images[i].dataUrl);
      if (data.text.trim()) {
        texts.push(data.text.trim());
      }
    }

    await worker.terminate();
    return texts.join("\n\n");
  }

  const hasContent = rawText.trim().length > 0 || pastedImages.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasContent) return;
    setLoading(true);
    setError(null);
    setProgressStep("Preparing...");
    setElapsed(0);

    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      // OCR images first if any
      let combinedText = rawText.trim();
      if (pastedImages.length > 0) {
        const ocrText = await ocrImages(pastedImages);
        if (ocrText) {
          combinedText = combinedText
            ? `${combinedText}\n\n--- Text from pasted image ---\n${ocrText}`
            : ocrText;
        }
      }

      if (!combinedText) {
        throw new Error("Could not extract any text from the pasted images. Please try typing the text manually.");
      }

      setProgressStep("Authenticating...");
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
        setProgressStep("Creating new vendor...");
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
        setProgressStep("Creating new project...");
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

      setProgressStep("Saving intake record...");
      const { data: intake, error: insertError } = await supabase
        .from("intakes")
        .insert({
          raw_text: combinedText,
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

      setProgressStep("Analyzing and extracting items...");
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_id: intake.id,
          raw_text: combinedText,
          vendor_id: resolvedVendorId,
          project_id: resolvedProjectId,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Extraction failed");
      }

      setProgressStep("Extraction complete! Loading review...");
      clearInterval(timer);
      router.push(`/intake/${intake.id}/review`);
    } catch (err) {
      clearInterval(timer);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
      setProgressStep("");
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Intake</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paste raw text or screenshots from Slack, email, or meeting notes. AI will extract action items, decisions, issues, and more.
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
            required={pastedImages.length === 0}
            placeholder="Paste Slack message, email, meeting notes, or any text here. You can also paste screenshots (Cmd+V)."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          {/* Pasted image previews */}
          {pastedImages.length > 0 && (
            <div className="mt-3 space-y-3">
              {pastedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative inline-block border border-gray-200 rounded-lg overflow-hidden"
                >
                  <img
                    src={img.dataUrl}
                    alt="Pasted screenshot"
                    className="max-w-full max-h-64 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute top-2 right-2 bg-white/90 hover:bg-red-50 text-gray-500 hover:text-red-600 rounded-full p-1 shadow transition-colors"
                    title="Remove image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
                    Screenshot — will be OCR'd on extract
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900">{progressStep}</p>
                <p className="text-xs text-blue-600">{elapsed}s elapsed</p>
              </div>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: "100%" }} />
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!hasContent}
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Extract{pastedImages.length > 0 ? ` (${pastedImages.length} image${pastedImages.length > 1 ? "s" : ""} will be OCR'd)` : ""}
          </button>
        )}
      </form>
    </div>
  );
}

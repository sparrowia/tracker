"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// Supabase client used only for storage uploads (anon key)
function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const ISSUE_TYPES = [
  "Accessibility",
  "Broken Link",
  "Bug",
  "Content",
  "Error",
  "Feature Request",
  "Functionality",
  "Navigation",
  "Performance - Load or Lag Times",
  "Responsive Issue",
  "Security",
  "Support Request",
  "UI/UX",
  "Other",
];

const OS_OPTIONS = ["Mac", "iOS", "Windows", "Android", "All"];
const BROWSER_OPTIONS = ["Chrome", "Safari", "Edge", "Firefox", "All"];

interface ProjectInfo {
  name: string;
  slug: string;
}

export default function PublicIssueForm({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  const [reporterName, setReporterName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [issueType, setIssueType] = useState("");
  const [url, setUrl] = useState("");
  const [os, setOs] = useState("");
  const [browser, setBrowser] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve params
  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  // Fetch project info via API (no auth needed)
  useEffect(() => {
    if (!slug) return;

    fetch(`/api/issues/project?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) {
          setNotAvailable(true);
          setLoading(false);
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          setProject({ name: data.name, slug: data.slug });
        }
        setLoading(false);
      })
      .catch(() => {
        setNotAvailable(true);
        setLoading(false);
      });
  }, [slug]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const combined = [...files, ...selected].slice(0, 5);
    setFiles(combined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadFiles(): Promise<string[]> {
    if (files.length === 0) return [];

    const supabase = getStorageClient();

    const urls: string[] = [];
    for (const file of files) {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${slug}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("issue-attachments")
        .upload(path, file);

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("issue-attachments")
          .getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }
    }
    return urls;
  }

  async function handleSubmit(andNew: boolean) {
    setError(null);

    if (!reporterName.trim() || !title.trim() || !description.trim() || !issueType || !os || !browser) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const attachmentUrls = await uploadFiles();

      const res = await fetch("/api/issues/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_slug: slug,
          reporter_name: reporterName.trim(),
          title: title.trim(),
          description: description.trim(),
          issue_type: issueType,
          url: url.trim() || undefined,
          os,
          browser,
          attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit issue");
        setSubmitting(false);
        return;
      }

      if (andNew) {
        // Clear form but keep reporter name
        setTitle("");
        setDescription("");
        setIssueType("");
        setUrl("");
        setOs("");
        setBrowser("");
        setFiles([]);
        setToast("Issue submitted successfully!");
        setTimeout(() => setToast(null), 3000);
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (notAvailable) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Form Not Available</h1>
          <p className="text-sm text-gray-500">This issue submission form is not available.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Issue Submitted</h1>
          <p className="text-sm text-gray-500 mb-6">
            Thank you for reporting this issue. Our team will review it shortly.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle("");
              setDescription("");
              setIssueType("");
              setUrl("");
              setOs("");
              setBrowser("");
              setFiles([]);
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Submit another issue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Edcetera</p>
          <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Report an issue</p>
        </div>

        {/* Toast */}
        {toast && (
          <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
            {toast}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* Reporter Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Your full name"
            />
          </div>

          {/* Issue Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issue Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Brief summary of the issue"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              placeholder="Describe the issue in detail. Include steps to reproduce if applicable."
            />
          </div>

          {/* Issue Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Issue Type <span className="text-red-500">*</span>
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select issue type</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="URL where issue occurred"
            />
          </div>

          {/* OS and Browser side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                OS <span className="text-red-500">*</span>
              </label>
              <select
                value={os}
                onChange={(e) => setOs(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select OS</option>
                {OS_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Browser <span className="text-red-500">*</span>
              </label>
              <select
                value={browser}
                onChange={(e) => setBrowser(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select browser</option>
                {BROWSER_OPTIONS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attachments <span className="text-gray-400 text-xs font-normal">(up to 5 files)</span>
            </label>
            {files.length > 0 && (
              <div className="mb-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded px-2 py-1">
                    <span className="truncate flex-1">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {files.length < 5 && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-blue-600 bg-white border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit & New
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Powered by Edcetera Tracker</p>
        </div>
      </div>
    </div>
  );
}

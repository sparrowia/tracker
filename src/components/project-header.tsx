"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import { isAdmin } from "@/lib/permissions";
import type { Project, ProjectHealth, Vendor, Person } from "@/lib/types";
import OwnerPicker from "@/components/owner-picker";
import Link from "next/link";

const healthOptions: ProjectHealth[] = ["on_track", "in_progress", "at_risk", "blocked", "paused", "complete"];

interface ProjectHeaderProps {
  project: Project;
  vendors: Vendor[];
  people: Person[];
}

export default function ProjectHeader({ project, vendors, people: initialPeople }: ProjectHeaderProps) {
  const [people, setPeople] = useState(initialPeople);
  const [p, setP] = useState(project);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    description: p.description || "",
    health: p.health,
    platform_status: p.platform_status || "",
    target_completion: p.target_completion || "",
    start_date: p.start_date || "",
    notes: p.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [publicIssueForm, setPublicIssueForm] = useState(project.public_issue_form ?? false);
  const [togglingForm, setTogglingForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vendorOwners, setVendorOwners] = useState<Record<string, string>>({}); // vendor_id -> person_id
  const { role } = useRole();

  // Load vendor owners
  useEffect(() => {
    if (vendors.length === 0) return;
    supabase.from("project_vendor_owners").select("vendor_id, person_id").eq("project_id", p.id).then(({ data }) => {
      const map: Record<string, string> = {};
      for (const row of (data || []) as { vendor_id: string; person_id: string }[]) map[row.vendor_id] = row.person_id;
      setVendorOwners(map);
    });
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const supabase = createClient();

  function startEdit() {
    setForm({
      name: p.name,
      description: p.description || "",
      health: p.health,
      platform_status: p.platform_status || "",
      target_completion: p.target_completion || "",
      start_date: p.start_date || "",
      notes: p.notes || "",
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const newName = form.name.trim();
    const nameChanged = newName !== p.name;
    const newSlug = nameChanged
      ? newName.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : p.slug;
    const updates: Record<string, unknown> = {
      name: newName,
      description: form.description.trim() || null,
      health: form.health,
      platform_status: form.platform_status.trim() || null,
      target_completion: form.target_completion || null,
      start_date: form.start_date || null,
      notes: form.notes.trim() || null,
      ...(nameChanged ? { slug: newSlug } : {}),
    };

    const { error } = await supabase.from("projects").update(updates).eq("id", p.id);
    if (!error) {
      setP({ ...p, ...updates, slug: newSlug } as Project);
      setEditing(false);
      window.dispatchEvent(new CustomEvent("sidebar:refresh"));
      // If slug changed, redirect to new URL
      if (nameChanged && newSlug !== p.slug) {
        window.location.href = `/projects/${newSlug}`;
      }
    }
    setSaving(false);
  }

  async function togglePublicIssueForm() {
    setTogglingForm(true);
    const newVal = !publicIssueForm;
    const { error } = await supabase
      .from("projects")
      .update({ public_issue_form: newVal })
      .eq("id", p.id);
    if (!error) {
      setPublicIssueForm(newVal);
    }
    setTogglingForm(false);
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/issues/${p.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (editing) {
    return (
      <div className="bg-white rounded-lg border border-gray-300 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Edit Project</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Health</label>
            <select
              value={form.health}
              onChange={(e) => setForm({ ...form, health: e.target.value as ProjectHealth })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {healthOptions.map((h) => (
                <option key={h} value={h}>{healthLabel(h)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Platform Status</label>
            <input
              type="text"
              value={form.platform_status}
              onChange={(e) => setForm({ ...form, platform_status: e.target.value })}
              placeholder="e.g. All 3 iOS APPROVED"
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Target Completion</label>
            <input
              type="date"
              value={form.target_completion}
              onChange={(e) => setForm({ ...form, target_completion: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Owner</label>
            <OwnerPicker
              value={p.project_owner_id || ""}
              onChange={(id) => {
                supabase.from("projects").update({ project_owner_id: id || null }).eq("id", p.id).then(() => {});
                setP((prev) => ({ ...prev, project_owner_id: id || null }));
              }}
              people={people}
              onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Manager</label>
            <OwnerPicker
              value={p.project_manager_id || ""}
              onChange={(id) => {
                supabase.from("projects").update({ project_manager_id: id || null }).eq("id", p.id).then(() => {});
                setP((prev) => ({ ...prev, project_manager_id: id || null }));
              }}
              people={people}
              onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Lead QA</label>
            <OwnerPicker
              value={p.lead_qa_id || ""}
              onChange={(id) => {
                supabase.from("projects").update({ lead_qa_id: id || null }).eq("id", p.id).then(() => {});
                setP((prev) => ({ ...prev, lead_qa_id: id || null }));
              }}
              people={people}
              onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
            />
          </div>
          {vendors.map((v) => (
            <div key={v.id}>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vendor Owner{vendors.length > 1 ? ` — ${v.name}` : ""}</label>
              <OwnerPicker
                value={vendorOwners[v.id] || ""}
                onChange={(id) => {
                  if (id) {
                    supabase.from("project_vendor_owners").upsert({ project_id: p.id, vendor_id: v.id, person_id: id }, { onConflict: "project_id,vendor_id" }).then(() => {});
                  } else {
                    supabase.from("project_vendor_owners").delete().eq("project_id", p.id).eq("vendor_id", v.id).then(() => {});
                  }
                  setVendorOwners((prev) => ({ ...prev, [v.id]: id || "" }));
                }}
                people={people}
                onPersonAdded={(person) => setPeople((prev) => [...prev, person])}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
          {healthLabel(p.health)}
        </span>
        <button
          onClick={startEdit}
          className="text-gray-400 hover:text-blue-600 transition-colors"
          title="Edit project"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
      <div className="flex gap-6 mt-3 text-sm text-gray-500">
        {p.platform_status && <span>Platform: {p.platform_status}</span>}
        {p.start_date && <span>Start: {formatDateShort(p.start_date)}</span>}
        {p.target_completion && <span>Target: {formatDateShort(p.target_completion)}</span>}
      </div>
      {(p.project_owner_id || p.project_manager_id || p.lead_qa_id || Object.values(vendorOwners).some(Boolean)) && (
        <div className="flex gap-6 mt-2 text-sm text-gray-500 flex-wrap">
          {p.project_owner_id && <span>Owner: <span className="text-gray-700 font-medium">{people.find((pp) => pp.id === p.project_owner_id)?.full_name || "—"}</span></span>}
          {p.project_manager_id && <span>PM: <span className="text-gray-700 font-medium">{people.find((pp) => pp.id === p.project_manager_id)?.full_name || "—"}</span></span>}
          {p.lead_qa_id && <span>Lead QA: <span className="text-gray-700 font-medium">{people.find((pp) => pp.id === p.lead_qa_id)?.full_name || "—"}</span></span>}
          {vendors.map((v) => vendorOwners[v.id] ? (
            <span key={v.id}>Vendor{vendors.length > 1 ? ` (${v.name})` : ""}: <span className="text-gray-700 font-medium">{people.find((pp) => pp.id === vendorOwners[v.id])?.full_name || "—"}</span></span>
          ) : null)}
        </div>
      )}
      {p.notes && <p className="text-sm text-gray-500 mt-2">{p.notes}</p>}
      {isAdmin(role) && (
        <div className="flex items-center gap-3 mt-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={togglePublicIssueForm}
              disabled={togglingForm}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                publicIssueForm ? "bg-blue-600" : "bg-gray-300"
              } ${togglingForm ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  publicIssueForm ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-gray-600">Public Issue Form</span>
          </label>
          {publicIssueForm && (
            <button
              onClick={copyPublicLink}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            >
              {copied ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy link
                </>
              )}
            </button>
          )}
        </div>
      )}
      {vendors.length > 0 && (
        <div className="flex gap-2 mt-3">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/settings/vendors/${v.id}`}
              className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
            >
              {v.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

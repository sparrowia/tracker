"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { healthLabel } from "@/lib/utils";
import type { ProjectHealth } from "@/lib/types";
import { useRole } from "@/components/role-context";

const HEALTH_OPTIONS: ProjectHealth[] = ["on_track", "in_progress", "at_risk", "blocked", "paused", "complete"];

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

interface AddInitiativeButtonProps {
  onSaved?: () => void;
  defaultValues?: { name?: string; description?: string; target_completion?: string };
  onCreated?: (id: string) => void;
  openExternal?: boolean;
}

export default function AddInitiativeButton({ onSaved, defaultValues, onCreated, openExternal }: AddInitiativeButtonProps = {}) {
  const { orgId } = useRole();
  const [open, setOpen] = useState(openExternal || false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: defaultValues?.name || "",
    slug: "",
    description: defaultValues?.description || "",
    health: "on_track" as ProjectHealth,
    target_completion: defaultValues?.target_completion || "",
  });
  const supabase = createClient();

  useEffect(() => {
    if (openExternal) setOpen(true);
  }, [openExternal]);

  function close() {
    setOpen(false);
    setForm({ name: "", slug: "", description: "", health: "on_track", target_completion: "" });
  }

  async function save() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    if (!orgId) { setSaving(false); return; }
    const slug = form.slug.trim() || generateSlug(form.name);
    const { data, error } = await supabase.from("initiatives").insert({
      org_id: orgId,
      name: form.name.trim(),
      slug,
      description: form.description.trim() || null,
      health: form.health,
      target_completion: form.target_completion || null,
    }).select("id").single();
    setSaving(false);
    if (!error) {
      close();
      if (onCreated && data) {
        onCreated(data.id);
      } else {
        onSaved?.();
      }
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        + Add Initiative
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={close}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">New Initiative</h2>
              <button onClick={close} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => {
                    if (form.name && !form.slug) {
                      setForm((f) => ({ ...f, slug: generateSlug(f.name) }));
                    }
                  }}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
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
                  {HEALTH_OPTIONS.map((h) => (
                    <option key={h} value={h}>{healthLabel(h)}</option>
                  ))}
                </select>
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
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button
                onClick={close}
                className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

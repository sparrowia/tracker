"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { healthColor, healthLabel } from "@/lib/utils";
import type { ProjectHealth, Initiative } from "@/lib/types";

const HEALTH_OPTIONS: ProjectHealth[] = ["on_track", "in_progress", "at_risk", "blocked", "paused", "complete"];

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default function AddProjectButton({ initiativeId }: { initiativeId?: string }) {
  const [open, setOpen] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    health: "on_track" as ProjectHealth,
    platform_status: "",
    start_date: "",
    target_completion: "",
    initiative_id: initiativeId || "",
  });
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (!initiativeId && open) {
      supabase.from("initiatives").select("*").order("name").then(({ data }) => {
        setInitiatives((data || []) as Initiative[]);
      });
    }
  }, [open, initiativeId]);

  function close() {
    setOpen(false);
    setForm({ name: "", slug: "", description: "", health: "on_track", platform_status: "", start_date: "", target_completion: "", initiative_id: initiativeId || "" });
  }

  async function save() {
    if (!form.name.trim()) return;
    const { data: profile } = await supabase.from("profiles").select("org_id").single();
    if (!profile?.org_id) return;
    const slug = form.slug.trim() || generateSlug(form.name);
    const { error } = await supabase.from("projects").insert({
      org_id: profile.org_id,
      name: form.name.trim(),
      slug,
      description: form.description.trim() || null,
      health: form.health,
      platform_status: form.platform_status.trim() || null,
      start_date: form.start_date || null,
      target_completion: form.target_completion || null,
      initiative_id: form.initiative_id || null,
    });
    if (!error) {
      close();
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        + Add Project
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
              <h2 className="text-lg font-semibold text-gray-900">New Project</h2>
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
              {/* Initiative dropdown — only shown when not pre-set */}
              {!initiativeId && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Initiative</label>
                  <select
                    value={form.initiative_id}
                    onChange={(e) => setForm({ ...form, initiative_id: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {initiatives.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Platform Status</label>
                <input
                  type="text"
                  value={form.platform_status}
                  onChange={(e) => setForm({ ...form, platform_status: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { priorityColor, formatAge } from "@/lib/utils";
import type { Blocker, Person, Vendor, Project, PriorityLevel } from "@/lib/types";

type BlockerRow = Blocker & {
  owner: Person | null;
  vendor: Vendor | null;
  project: Project | null;
};

const priorityOptions: PriorityLevel[] = ["critical", "high", "medium", "low"];

export default function BlockersPage() {
  const [blockers, setBlockers] = useState<BlockerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", impact_description: "", description: "", priority: "" as PriorityLevel });
  const [people, setPeople] = useState<Person[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const [{ data }, { data: ppl }, { data: v }, { data: p }] = await Promise.all([
        supabase
          .from("blocker_ages")
          .select("*, owner:people(*), vendor:vendors(*), project:projects(*)")
          .order("priority")
          .order("first_flagged_at"),
        supabase.from("people").select("*").order("full_name"),
        supabase.from("vendors").select("*").order("name"),
        supabase.from("projects").select("*").order("name"),
      ]);
      setBlockers((data || []) as BlockerRow[]);
      setPeople((ppl || []) as Person[]);
      setVendors((v || []) as Vendor[]);
      setProjects((p || []) as Project[]);
      setLoading(false);
    }
    load();
  }, []);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    if (editingId && editingId !== id) setEditingId(null);
  }

  function startEdit(b: BlockerRow) {
    setEditingId(b.id);
    setEditForm({
      title: b.title,
      impact_description: b.impact_description || "",
      description: b.description || "",
      priority: b.priority,
    });
  }

  async function saveEdit(id: string) {
    const { error } = await supabase
      .from("blockers")
      .update({
        title: editForm.title,
        impact_description: editForm.impact_description || null,
        description: editForm.description || null,
        priority: editForm.priority,
      })
      .eq("id", id);

    if (!error) {
      setBlockers((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, title: editForm.title, impact_description: editForm.impact_description || null, description: editForm.description || null, priority: editForm.priority as PriorityLevel }
            : b
        )
      );
      setEditingId(null);
    }
  }

  async function handleResolve(id: string) {
    const now = new Date().toISOString();
    await supabase.from("blockers").update({ resolved_at: now, status: "complete" }).eq("id", id);
    setBlockers((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleDelete(id: string) {
    await supabase.from("blockers").delete().eq("id", id);
    setBlockers((prev) => prev.filter((b) => b.id !== id));
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <p className="text-sm text-gray-500">Loading blockers...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Active Blockers ({blockers.length})
      </h1>

      {blockers.length === 0 ? (
        <p className="text-sm text-gray-500">No active blockers.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-6"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Blocker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {blockers.map((b) => {
                const isExpanded = expandedId === b.id;
                const isEditing = editingId === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleExpand(b.id)}
                    >
                      <td className="px-4 py-3 text-gray-400">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{b.title}</td>
                      <td className="px-4 py-3 text-sm">
                        {b.project ? (
                          <Link
                            href={`/projects/${b.project.slug}`}
                            className="text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {b.project.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {b.vendor ? (
                          <Link
                            href={`/vendors/${b.vendor.id}`}
                            className="text-blue-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {b.vendor.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{b.owner?.full_name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(b.priority)}`}>
                          {b.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={
                          b.age_severity === "critical" ? "text-red-600 font-semibold" :
                          b.age_severity === "aging" ? "text-orange-600 font-medium" :
                          "text-gray-600"
                        }>
                          {b.age_days != null ? formatAge(b.age_days) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                        {b.impact_description || "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50 px-8 py-4">
                          {isEditing ? (
                            <div className="space-y-3 max-w-2xl">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                                <input
                                  type="text"
                                  value={editForm.title}
                                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                                <select
                                  value={editForm.priority}
                                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as PriorityLevel })}
                                  className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {priorityOptions.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Impact</label>
                                <textarea
                                  value={editForm.impact_description}
                                  onChange={(e) => setEditForm({ ...editForm, impact_description: e.target.value })}
                                  rows={2}
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Notes / Description</label>
                                <textarea
                                  value={editForm.description}
                                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                  rows={2}
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); saveEdit(b.id); }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">Impact</span>
                                  <p className="text-gray-900 mt-0.5">{b.impact_description || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">Description</span>
                                  <p className="text-gray-900 mt-0.5">{b.description || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">Status</span>
                                  <p className="text-gray-900 mt-0.5">{b.status.replace(/_/g, " ")}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">Due Date</span>
                                  <p className="text-gray-900 mt-0.5">{b.due_date || "—"}</p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">First Flagged</span>
                                  <p className="text-gray-900 mt-0.5">
                                    {new Date(b.first_flagged_at).toLocaleDateString()}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500 uppercase">Escalations</span>
                                  <p className="text-gray-900 mt-0.5">{b.escalation_count > 0 ? `${b.escalation_count}x` : "None"}</p>
                                </div>
                              </div>
                              <div className="flex justify-end items-center gap-3 pt-2 border-t border-gray-200 mt-3">
                                {/* Edit */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEdit(b); }}
                                  className="text-gray-400 hover:text-blue-600 transition-colors"
                                  title="Edit"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                                {/* Delete */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(b.id); }}
                                  className="text-gray-400 hover:text-red-600 transition-colors"
                                  title="Delete"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                </button>
                                {/* Resolve */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleResolve(b.id); }}
                                  className="text-gray-400 hover:text-green-600 transition-colors"
                                  title="Resolve"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Need Fragment for adjacent <tr> elements
import { Fragment } from "react";

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import OwnerPicker from "@/components/owner-picker";
import type { Initiative, Project, Person } from "@/lib/types";
import AddProjectButton from "@/components/add-project-button";

const HEALTH_OPTIONS: { value: string; label: string }[] = [
  { value: "on_track", label: "On Track" },
  { value: "in_progress", label: "In Progress" },
  { value: "at_risk", label: "At Risk" },
  { value: "off_track", label: "Off Track" },
  { value: "complete", label: "Complete" },
];

export default function InitiativeDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { role, profileId, userPersonId } = useRole();
  const [initiative, setInitiative] = useState<Initiative | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [owners, setOwners] = useState<Person[]>([]);
  const supabase = createClient();

  const isAdmin = role === "super_admin" || role === "admin";
  const isOwner = owners.some((o) => o.id === userPersonId) || (initiative?.owner_id != null && initiative.owner_id === userPersonId);
  const canEdit = isAdmin || isOwner;

  useEffect(() => {
    async function load() {
      const { data: init } = await supabase
        .from("initiatives")
        .select("*, owner:people!initiatives_owner_id_fkey(id, full_name)")
        .eq("slug", slug)
        .single();

      if (!init) { setLoading(false); return; }

      const [{ data: projs }, { data: ppl }, { data: ownerData }] = await Promise.all([
        supabase.from("projects").select("*").eq("initiative_id", init.id).order("name"),
        supabase.from("people").select("*").order("full_name"),
        supabase.from("initiative_owners").select("person_id, person:people(*)").eq("initiative_id", init.id),
      ]);

      setInitiative(init as Initiative);
      setProjects((projs || []) as Project[]);
      setPeople((ppl || []) as Person[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setOwners((ownerData || []).map((o: any) => o.person).filter(Boolean) as Person[]);
      setLoading(false);
    }
    load();
  }, [slug]);

  const updateField = useCallback(async (field: string, value: string | null) => {
    if (!initiative) return;
    await supabase.from("initiatives").update({ [field]: value }).eq("id", initiative.id).then(() => {});
    setInitiative((prev) => prev ? { ...prev, [field]: value } : prev);
  }, [initiative]);

  const handlePersonAdded = useCallback((person: Person) => {
    setPeople((prev) => [...prev, person]);
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-pulse">
        <div className="flex items-center gap-1">
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-2 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
        </div>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-64 bg-gray-200 rounded" />
            <div className="h-6 w-20 bg-gray-200 rounded-full" />
          </div>
          <div className="h-4 w-96 bg-gray-200 rounded mt-2" />
        </div>
        <section>
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <div className="h-4 w-28 bg-gray-600 rounded" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-200 flex items-center gap-8">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-gray-500">Initiative not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link href="/initiatives" className="hover:text-blue-600">Initiatives</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900 font-medium">{initiative.name}</span>
      </div>

      {/* Header — editable name */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          {canEdit && editingName ? (
            <input
              autoFocus
              defaultValue={initiative.name}
              className="text-2xl font-bold text-gray-900 border-b-2 border-blue-400 outline-none bg-transparent"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== initiative.name) updateField("name", v);
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
          ) : (
            <h1
              className={`text-2xl font-bold text-gray-900 ${canEdit ? "cursor-pointer hover:text-blue-600" : ""}`}
              onClick={() => canEdit && setEditingName(true)}
            >
              {initiative.name}
            </h1>
          )}
          <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(initiative.health)}`}>
            {healthLabel(initiative.health)}
          </span>
        </div>
      </div>

      {/* Properties grid */}
      <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2.5">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Details</h2>
        </div>
        <div className="grid grid-cols-[120px_1fr_120px_1fr] border-b border-gray-200">
          {/* Health */}
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 flex items-center">Health</div>
          <div className="px-4 py-2.5 border-r border-gray-200 flex items-center">
            {canEdit ? (
              <select
                value={initiative.health}
                onChange={(e) => updateField("health", e.target.value)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                {HEALTH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(initiative.health)}`}>
                {healthLabel(initiative.health)}
              </span>
            )}
          </div>

          {/* Owners */}
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 flex items-center">Owners</div>
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
            {owners.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1 text-sm bg-blue-50 text-blue-700 rounded-full px-2.5 py-0.5">
                {o.full_name}
                {canEdit && (
                  <button
                    onClick={async () => {
                      await supabase.from("initiative_owners").delete().eq("initiative_id", initiative.id).eq("person_id", o.id);
                      setOwners((prev) => prev.filter((p) => p.id !== o.id));
                    }}
                    className="text-blue-400 hover:text-red-500 ml-0.5"
                    title="Remove owner"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </span>
            ))}
            {owners.length === 0 && !canEdit && <span className="text-sm text-gray-400 italic">No owners</span>}
            {canEdit && (
              <OwnerPicker
                value=""
                onChange={async (id) => {
                  if (!id || owners.some((o) => o.id === id)) return;
                  await supabase.from("initiative_owners").insert({ initiative_id: initiative.id, person_id: id });
                  const person = people.find((p) => p.id === id);
                  if (person) setOwners((prev) => [...prev, person]);
                  // Also update legacy owner_id if it's the first owner
                  if (owners.length === 0) updateField("owner_id", id);
                }}
                people={people.filter((p) => !owners.some((o) => o.id === p.id))}
                onPersonAdded={handlePersonAdded}
              />
            )}
          </div>
        </div>
        <div className="grid grid-cols-[120px_1fr_120px_1fr] border-b border-gray-200">
          {/* Target date */}
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 flex items-center">Target</div>
          <div className="px-4 py-2.5 border-r border-gray-200 flex items-center">
            {canEdit ? (
              <input
                type="date"
                value={initiative.target_completion || ""}
                onChange={(e) => updateField("target_completion", e.target.value || null)}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              />
            ) : (
              <span className="text-sm text-gray-700">{formatDateShort(initiative.target_completion) || "—"}</span>
            )}
          </div>

          {/* Slug (read-only) */}
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-r border-gray-200 flex items-center">Slug</div>
          <div className="px-4 py-2.5 flex items-center">
            <span className="text-sm text-gray-500 font-mono">{initiative.slug}</span>
          </div>
        </div>

        {/* Description */}
        <div className="border-b border-gray-200">
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-200">Description</div>
          <div className="px-4 py-3">
            {canEdit && editingDesc ? (
              <textarea
                autoFocus
                defaultValue={initiative.description || ""}
                rows={3}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-400"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  updateField("description", v || null);
                  setEditingDesc(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingDesc(false);
                }}
              />
            ) : (
              <p
                className={`text-sm text-gray-700 whitespace-pre-wrap ${canEdit ? "cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1" : ""}`}
                onClick={() => canEdit && setEditingDesc(true)}
              >
                {initiative.description || <span className="text-gray-400 italic">No description</span>}
              </p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-200">Notes</div>
          <div className="px-4 py-3">
            {canEdit && editingNotes ? (
              <textarea
                autoFocus
                defaultValue={initiative.notes || ""}
                rows={3}
                className="w-full text-sm border border-gray-300 rounded px-3 py-2 outline-none focus:border-blue-400"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  updateField("notes", v || null);
                  setEditingNotes(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingNotes(false);
                }}
              />
            ) : (
              <p
                className={`text-sm text-gray-700 whitespace-pre-wrap ${canEdit ? "cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1" : ""}`}
                onClick={() => canEdit && setEditingNotes(true)}
              >
                {initiative.notes || <span className="text-gray-400 italic">No notes</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Projects */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          {canEdit && <AddProjectButton initiativeId={initiative.id} />}
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects in this initiative yet.</p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
                Projects ({projects.length})
              </h3>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Health</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.slug}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${healthColor(p.health)}`}>
                        {healthLabel(p.health)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.platform_status || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(p.target_completion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

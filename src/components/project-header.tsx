"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { healthColor, healthLabel, formatDateShort } from "@/lib/utils";
import { useRole } from "@/components/role-context";
import { isAdmin } from "@/lib/permissions";
import type { Project, ProjectHealth, Vendor, Person, Initiative } from "@/lib/types";
import SteeringCommitteeSection from "@/components/steering-committee-section";
import Link from "next/link";

const healthOptions: ProjectHealth[] = ["on_track", "in_progress", "at_risk", "blocked", "paused", "complete"];

const MODULE_OPTIONS: { key: string; label: string; required?: boolean }[] = [
  { key: "actions", label: "Action Items", required: true },
  { key: "blockers", label: "Blockers" },
  { key: "raid", label: "RAID Log" },
  { key: "agenda", label: "Meeting Agenda" },
  { key: "docs", label: "Docs" },
  { key: "roadmap", label: "Roadmap" },
];

const DEFAULT_MODULES = ["actions", "raid", "docs"];

// Team member row with its project role. Owner is exactly one per project,
// assigned to the creator by default and reassignable only by a super admin.
type TeamMember = {
  person_id: string;
  role: string;
  person: { id: string; full_name: string; vendor_id: string | null; vendor?: { name: string } | null } | null;
};

const MEMBER_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "project_manager", label: "Project Manager" },
  { value: "product", label: "Product" },
  { value: "qa", label: "QA" },
  { value: "member_full", label: "Member - Full" },
  { value: "member_assigned", label: "Member - Assigned" },
  { value: "vendor", label: "Vendor" },
];
const memberRoleLabel = (r: string) => MEMBER_ROLE_OPTIONS.find((o) => o.value === r)?.label || r;

interface ProjectHeaderProps {
  project: Project;
  vendors: Vendor[];
  people: Person[];
}

export default function ProjectHeader({ project, vendors, people: initialPeople }: ProjectHeaderProps) {
  const [people] = useState(initialPeople);
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
    initiative_id: p.initiative_id || "",
    modules: p.modules ?? DEFAULT_MODULES,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publicIssueForm, setPublicIssueForm] = useState(project.public_issue_form ?? false);
  const [togglingForm, setTogglingForm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [healthOverride, setHealthOverride] = useState<ProjectHealth | null>(null);
  const [allInitiatives, setAllInitiatives] = useState<Initiative[]>([]);
  const { role, profileId, userPersonId } = useRole();
  const displayHealth = healthOverride ?? p.health;
  const canDeleteProject = role === "super_admin" || (!!profileId && p.created_by === profileId);
  const [ownedInitiativeIds, setOwnedInitiativeIds] = useState<Set<string>>(new Set());
  // Admins can move the project to any initiative; others only to ones they own
  // (junction table or legacy owner_id). The current initiative is always listed
  // so the select can render its present value.
  const selectableInitiatives = isAdmin(role)
    ? allInitiatives
    : allInitiatives.filter((i) => i.id === p.initiative_id || (userPersonId && (i.owner_id === userPersonId || ownedInitiativeIds.has(i.id))));

  useEffect(() => {
    if (isAdmin(role) || !userPersonId) return;
    supabase.from("initiative_owners").select("initiative_id").eq("person_id", userPersonId).then(({ data }) => {
      setOwnedInitiativeIds(new Set(((data || []) as { initiative_id: string }[]).map((r) => r.initiative_id)));
    });
  }, [role, userPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load initiatives for reassignment dropdown
  useEffect(() => {
    supabase.from("initiatives").select("*").order("name").then(({ data }) => {
      if (data) setAllInitiatives(data as Initiative[]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load team members with their roles
  useEffect(() => {
    supabase
      .from("project_members")
      .select("person_id, role, person:people(id, full_name, vendor_id, vendor:vendors(name))")
      .eq("project_id", p.id)
      .then(({ data }) => {
        setMembers(sortMembers((data || []) as unknown as TeamMember[]));
      });
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const supabase = createClient();

  function sortMembers(list: TeamMember[]) {
    // Owner first, then alphabetical
    return [...list].sort((a, b) =>
      a.role === "owner" ? -1 : b.role === "owner" ? 1 : (a.person?.full_name || "").localeCompare(b.person?.full_name || "")
    );
  }

  async function addMember(personId: string) {
    if (!personId || members.some((m) => m.person_id === personId)) return;
    const person = people.find((pp) => pp.id === personId);
    const defaultRole = person?.vendor_id ? "vendor" : "product";
    const { data, error } = await supabase
      .from("project_members")
      .insert({ project_id: p.id, person_id: personId, role: defaultRole })
      .select("person_id, role, person:people(id, full_name, vendor_id, vendor:vendors(name))")
      .single();
    if (error || !data) {
      alert(error ? `Could not add team member: ${error.message}` : "Could not add team member — you may not have permission.");
      return;
    }
    setMembers((prev) => sortMembers([...prev, data as unknown as TeamMember]));
    window.dispatchEvent(new Event("sidebar:refresh"));
  }

  async function removeMember(personId: string) {
    setMembers((prev) => prev.filter((m) => m.person_id !== personId));
    const { data, error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", p.id)
      .eq("person_id", personId)
      .select("person_id");
    if (error || !data?.length) {
      alert(error ? `Could not remove team member: ${error.message}` : "Could not remove team member — you may not have permission.");
      const { data: rows } = await supabase
        .from("project_members")
        .select("person_id, role_label, person:people(id, full_name, vendor_id, vendor:vendors(name))")
        .eq("project_id", p.id);
      setMembers(sortMembers((rows || []) as unknown as TeamMember[]));
      return;
    }
    window.dispatchEvent(new Event("sidebar:refresh"));
  }

  async function saveMemberRole(personId: string, newRole: string) {
    const prevRole = members.find((m) => m.person_id === personId)?.role;
    if (!prevRole || newRole === prevRole) return;
    if (newRole === "owner" || prevRole === "owner") {
      if (role !== "super_admin") {
        alert("Only a super admin can change the project owner.");
        return;
      }
    }
    if (newRole === "owner") {
      // Atomic reassignment: previous owner becomes Project Manager
      const { error } = await supabase.rpc("reassign_project_owner", { p_project_id: p.id, p_person_id: personId });
      if (error) {
        alert(`Could not reassign owner: ${error.message}`);
        return;
      }
      setMembers((list) => sortMembers(list.map((m) =>
        m.person_id === personId ? { ...m, role: "owner" } : m.role === "owner" ? { ...m, role: "project_manager" } : m
      )));
      setP((prev) => ({ ...prev, project_owner_id: personId }));
      return;
    }
    if (prevRole === "owner") {
      alert("Every project needs an owner — pick Owner on another member to reassign instead.");
      return;
    }
    setMembers((list) => list.map((m) => (m.person_id === personId ? { ...m, role: newRole } : m)));
    const { data, error } = await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("project_id", p.id)
      .eq("person_id", personId)
      .select("person_id")
      .single();
    if (error || !data) {
      alert(error ? `Could not change role: ${error.message}` : "Could not change role — you may not have permission.");
      setMembers((list) => list.map((m) => (m.person_id === personId ? { ...m, role: prevRole } : m)));
    }
  }

  function startEdit() {
    setForm({
      name: p.name,
      description: p.description || "",
      health: p.health,
      platform_status: p.platform_status || "",
      target_completion: p.target_completion || "",
      start_date: p.start_date || "",
      notes: p.notes || "",
      initiative_id: p.initiative_id || "",
      modules: p.modules ?? DEFAULT_MODULES,
    });
    setEditing(true);
  }

  function setProjectLink() {
    const url = window.prompt("Project link (URL):", p.asana_link || "");
    if (url === null) return; // cancelled
    const val = url.trim() || null;
    supabase.from("projects").update({ asana_link: val }).eq("id", p.id).then(({ error }) => { if (error) console.error("Save project link failed:", error); });
    setP((prev) => ({ ...prev, asana_link: val } as Project));
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
      initiative_id: form.initiative_id || null,
      // Canonical order, with the required module always present
      modules: MODULE_OPTIONS.filter((m) => m.required || form.modules.includes(m.key)).map((m) => m.key),
      ...(nameChanged ? { slug: newSlug } : {}),
    };

    const { error } = await supabase.from("projects").update(updates).eq("id", p.id);
    if (!error) {
      setP({ ...p, ...updates, slug: newSlug } as Project);
      setEditing(false);
      window.dispatchEvent(new CustomEvent("sidebar:refresh"));
      window.dispatchEvent(new CustomEvent("project:modules-change", { detail: { projectId: p.id, modules: updates.modules } }));
      // If slug changed, redirect to new URL
      if (nameChanged && newSlug !== p.slug) {
        window.location.href = `/projects/${newSlug}`;
      }
    }
    setSaving(false);
  }

  async function deleteProject() {
    if (!confirm(`Delete "${p.name}"? Action items, blockers, and RAID entries will be kept but detached from this project.`)) return;
    setDeleting(true);
    // .select() so an RLS-denied delete (0 rows, no error) doesn't look like success
    const { data, error } = await supabase.from("projects").delete().eq("id", p.id).select("id");
    if (error || !data?.length) {
      alert(error ? `Could not delete project: ${error.message}` : "Could not delete project — you may not have permission.");
      setDeleting(false);
      return;
    }
    window.dispatchEvent(new CustomEvent("sidebar:refresh"));
    window.location.href = "/projects";
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

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Initiative</label>
            <select
              value={form.initiative_id}
              onChange={(e) => setForm({ ...form, initiative_id: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— None —</option>
              {selectableInitiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
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

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Modules</label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {MODULE_OPTIONS.map((m) => (
                <label key={m.key} className={`flex items-center gap-2 text-sm ${m.required ? "text-gray-400" : "text-gray-700"}`}>
                  <input
                    type="checkbox"
                    checked={m.required || form.modules.includes(m.key)}
                    disabled={m.required}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        modules: e.target.checked
                          ? [...form.modules, m.key]
                          : form.modules.filter((k) => k !== m.key),
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Team Members</label>
            <div className="space-y-2">
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  e.target.value = "";
                  addMember(id);
                }}
              >
                <option value="">+ Add team member...</option>
                {people.filter((pp) => !members.some((m) => m.person_id === pp.id)).map((pp) => (
                  <option key={pp.id} value={pp.id}>
                    {pp.full_name}{pp.vendor_id ? ` - ${vendors.find((v) => v.id === pp.vendor_id)?.name || "Vendor"}` : ""}
                  </option>
                ))}
              </select>
              {members.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No team members yet. Add people and assign each a role.</p>
              ) : (
                <div className="rounded-md border border-gray-200">
                  {members.map((m) => (
                    <div key={m.person_id} className="flex items-center gap-2 py-1.5 px-3 border-b border-gray-100 last:border-b-0">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                        {(m.person?.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                      <span className="text-sm text-gray-900">{m.person?.full_name || "Unknown"}</span>
                      {m.person?.vendor_id && <span className="text-xs text-gray-400">- {m.person?.vendor?.name || "Vendor"}</span>}
                      <select
                        value={m.role}
                        onChange={(e) => saveMemberRole(m.person_id, e.target.value)}
                        className="ml-auto w-44 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
                        title={m.role === "owner" && role !== "super_admin" ? "Only a super admin can change the owner" : undefined}
                      >
                        {MEMBER_ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} disabled={o.value === "owner" && role !== "super_admin"}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {(m.role !== "owner" || role === "super_admin") && (
                        <button
                          onClick={() => removeMember(m.person_id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove from team"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-200">
          {canDeleteProject ? (
            <button
              onClick={deleteProject}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete Project"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
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
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
        <span className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full border ${healthColor(displayHealth)}`}>
          {healthLabel(displayHealth)}
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
        <div className="ml-auto flex items-center gap-2">
          {p.asana_link ? (
            <>
              <a
                href={p.asana_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Project link
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </a>
              {isAdmin(role) && (
                <button onClick={setProjectLink} className="text-gray-400 hover:text-blue-600 transition-colors" title="Edit project link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </>
          ) : isAdmin(role) ? (
            <button onClick={setProjectLink} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Project link
            </button>
          ) : null}
        </div>
      </div>
      {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
      <div className="flex gap-6 mt-3 text-sm text-gray-500 flex-wrap items-center">
        {p.platform_status && <span>Platform: {p.platform_status}</span>}
        {p.start_date && <span>Start: {formatDateShort(p.start_date)}</span>}
        {p.target_completion && <span>Target: {formatDateShort(p.target_completion)}</span>}
      </div>
      {(p.project_owner_id || members.length > 0) && (
        <div className="flex gap-6 mt-2 text-sm text-gray-500 flex-wrap">
          {p.project_owner_id && <span><span className="font-medium text-gray-700">Owner:</span> {people.find((pp) => pp.id === p.project_owner_id)?.full_name || "—"}</span>}
          {members.length > 0 && (
            <span>
              <span className="font-medium text-gray-700">Team:</span>{" "}
              {members.map((m, i) => (
                <span key={m.person_id}>
                  {i > 0 && ", "}
                  {m.person?.full_name || "Unknown"}
                  <span className="text-gray-400"> ({memberRoleLabel(m.role)})</span>
                </span>
              ))}
            </span>
          )}
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

      {/* Steering Committee */}
      <div className="mt-4">
        <SteeringCommitteeSection
          entity={p}
          entityType="project"
          tableName="projects"
          people={people}
          onHealthOverride={setHealthOverride}
          onEntityUpdate={(updates) => setP((prev) => ({ ...prev, ...updates } as Project))}
        />
      </div>
    </div>
  );
}

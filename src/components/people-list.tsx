"use client";

import { useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { isAdmin } from "@/lib/permissions";
import Link from "next/link";
import type { Person, Vendor, Profile, Invitation } from "@/lib/types";

type PersonRow = Omit<Person, "vendor"> & { vendor: Vendor | null };

type ContactStatus = "joined" | "invited" | "added";

interface PeopleListProps {
  initialPeople: PersonRow[];
  vendors: Vendor[];
  profiles: Pick<Profile, "id" | "role" | "vendor_id" | "full_name">[];
  initialInvitations: Pick<Invitation, "id" | "email" | "accepted_at">[];
}

export default function PeopleList({ initialPeople, vendors, profiles, initialInvitations }: PeopleListProps) {
  const { role, profileId, orgId } = useRole();
  const [people, setPeople] = useState<PersonRow[]>(initialPeople);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingInternal, setAddingInternal] = useState(false);
  const [addingExternal, setAddingExternal] = useState(false);
  const [addName, setAddName] = useState("");
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteFormId, setInviteFormId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<string>("user");
  const [inviteVendorId, setInviteVendorId] = useState<string>("");
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"internal" | "vendors">("internal");
  const internal = people.filter((p) => p.is_internal).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const external = people.filter((p) => !p.is_internal).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const canEdit = isAdmin(role);

  // Group external contacts by vendor name
  const vendorGroupsMap = new Map<string, { vendor: Vendor | null; people: typeof external }>();
  for (const p of external) {
    const key = p.vendor?.name || "Unassigned";
    if (!vendorGroupsMap.has(key)) vendorGroupsMap.set(key, { vendor: p.vendor, people: [] });
    vendorGroupsMap.get(key)!.people.push(p);
  }
  const vendorGroups = [...vendorGroupsMap.entries()].sort((a, b) => {
    if (a[0] === "Unassigned") return 1;
    if (b[0] === "Unassigned") return -1;
    return a[0].localeCompare(b[0]);
  });

  function getContactStatus(person: PersonRow): ContactStatus {
    if (person.profile_id) return "joined";
    if (person.email && invitations.some((inv) => inv.email.toLowerCase() === person.email!.toLowerCase() && !inv.accepted_at)) return "invited";
    return "added";
  }

  function statusBadge(status: ContactStatus) {
    switch (status) {
      case "joined": return { label: "Joined", className: "text-green-700 bg-green-100" };
      case "invited": return { label: "Invited", className: "text-blue-700 bg-blue-100" };
      case "added": return { label: "Added", className: "text-gray-700 bg-gray-100" };
    }
  }

  function saveField(id: string, field: string, value: string | boolean | null) {
    const dbUpdates: Record<string, unknown> = { [field]: value };

    // When toggling to internal, also clear vendor
    if (field === "is_internal" && value === true) {
      dbUpdates.vendor_id = null;
      setPeople((prev) => prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, is_internal: true, vendor_id: null };
        updated.vendor = null;
        return updated;
      }));
      supabase.from("people").update(dbUpdates).eq("id", id).then(({ error }) => {
        if (error) console.error("Save failed:", error);
      });
      return;
    }

    if (field === "vendor_id") {
      const newVendor = vendors.find((v) => v.id === value) || null;
      setPeople((prev) => prev.map((p) => p.id === id ? { ...p, vendor_id: (value as string) || null, vendor: newVendor } as PersonRow : p));
    } else {
      setPeople((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
    }

    supabase.from("people").update(dbUpdates).eq("id", id).then(({ error }) => {
      if (error) console.error("Save failed:", error);
    });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("people").delete().eq("id", id);
    if (!error) {
      setPeople((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    }
  }

  async function handleAdd(isInternal: boolean) {
    if (!addName.trim()) return;
    const { data, error } = await supabase
      .from("people")
      .insert({
        full_name: addName.trim(),
        org_id: orgId,
        is_internal: isInternal,
        created_by: profileId,
      })
      .select("*, vendor:vendors(*)")
      .single();
    if (!error && data) {
      setPeople((prev) => [...prev, data as PersonRow]);
      setAddName("");
      setAddingInternal(false);
      setAddingExternal(false);
      setExpandedId(data.id);
    }
  }

  async function handleResendInvite(person: PersonRow) {
    if (!person.email) return;
    setInvitingId(person.id);
    try {
      const res = await fetch("/api/invite/resend-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: person.email }),
      });
      const result = await res.json();
      if (res.ok) {
        alert("Invite email sent to " + person.email);
      } else {
        alert(result.error || "Failed to send invite");
      }
    } catch {
      alert("Failed to send invite");
    } finally {
      setInvitingId(null);
    }
  }

  async function handleInvite(person: PersonRow) {
    if (!person.email) return;
    setInvitingId(person.id);
    try {
      const selectedRole = inviteRole === "vendor" ? "vendor" : inviteRole;
      const selectedVendorId = selectedRole === "vendor" ? (inviteVendorId || person.vendor_id || undefined) : undefined;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: person.email,
          role: selectedRole,
          vendor_id: selectedVendorId,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setInvitations((prev) => [...prev, { id: result.invitation.id, email: person.email!, accepted_at: null }]);
        setInviteFormId(null);
        setInviteRole("user");
        setInviteVendorId("");
      } else {
        alert(result.error || "Failed to send invitation");
      }
    } catch {
      alert("Failed to send invitation");
    } finally {
      setInvitingId(null);
    }
  }

  function startImpersonation(person: PersonRow) {
    const linkedProfile = person.profile_id ? profiles.find((pr) => pr.id === person.profile_id) : null;
    const impersonation = {
      personId: person.id,
      personName: person.full_name,
      role: linkedProfile?.role || (person.vendor_id ? "vendor" : "user"),
      vendorId: person.vendor_id || linkedProfile?.vendor_id || null,
    };
    sessionStorage.setItem("impersonation", JSON.stringify(impersonation));
    window.dispatchEvent(new Event("impersonation-change"));
  }

  function renderEditPanel(person: PersonRow) {
    const status = getContactStatus(person);
    return (
      <div className="bg-white border-b border-gray-200 px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-[100px_1fr_100px_1fr] gap-y-3 gap-x-4 items-center max-w-3xl">
          <label className="text-xs font-medium text-gray-400">Name</label>
          <input
            type="text"
            defaultValue={person.full_name}
            onBlur={(e) => { if (e.target.value !== person.full_name) saveField(person.id, "full_name", e.target.value); }}
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-xs font-medium text-gray-400">Title</label>
          <input
            type="text"
            defaultValue={person.title || ""}
            onBlur={(e) => { if (e.target.value !== (person.title || "")) saveField(person.id, "title", e.target.value || null); }}
            placeholder="—"
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-xs font-medium text-gray-400">Email</label>
          <input
            type="email"
            defaultValue={person.email || ""}
            onBlur={(e) => { if (e.target.value !== (person.email || "")) saveField(person.id, "email", e.target.value || null); }}
            placeholder="—"
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-xs font-medium text-gray-400">Phone</label>
          <input
            type="tel"
            defaultValue={person.phone || ""}
            onBlur={(e) => { if (e.target.value !== (person.phone || "")) saveField(person.id, "phone", e.target.value || null); }}
            placeholder="—"
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <label className="text-xs font-medium text-gray-400">Slack ID</label>
          <input
            type="text"
            defaultValue={person.slack_member_id || ""}
            onBlur={(e) => { if (e.target.value !== (person.slack_member_id || "")) saveField(person.id, "slack_member_id", e.target.value || null); }}
            placeholder="U0XXXXXXXX"
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {!person.is_internal && (
            <>
              <label className="text-xs font-medium text-gray-400">Vendor</label>
              <select
                value={person.vendor_id || ""}
                onChange={(e) => saveField(person.id, "vendor_id", e.target.value || null)}
                className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="">None</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </>
          )}
          <label className="text-xs font-medium text-gray-400">Internal</label>
          <div>
            <input
              type="checkbox"
              checked={person.is_internal}
              onChange={(e) => saveField(person.id, "is_internal", e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
          {person.profile_id && (() => {
            const linkedProfile = profiles.find((pr) => pr.id === person.profile_id);
            if (!linkedProfile || linkedProfile.role === "super_admin") return null;
            return (
              <>
                <label className="text-xs font-medium text-gray-400">Role</label>
                <select
                  value={linkedProfile.role}
                  onChange={async (e) => {
                    await supabase.from("profiles").update({ role: e.target.value }).eq("id", person.profile_id!);
                  }}
                  className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="vendor">Vendor</option>
                </select>
              </>
            );
          })()}
        </div>
        <div className="mt-3 max-w-3xl">
          <label className="text-xs font-medium text-gray-400">Notes</label>
          <textarea
            defaultValue={person.notes || ""}
            onBlur={(e) => { if (e.target.value !== (person.notes || "")) saveField(person.id, "notes", e.target.value || null); }}
            placeholder="Add notes..."
            rows={2}
            className="mt-1 w-full text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
          />
        </div>
        {/* Actions bar — full width with border, matching RAID log */}
        <div className="flex justify-between items-center px-5 py-2 border-t border-gray-200 mt-3 -mx-4 -mb-4">
          <div className="flex items-center gap-3">
            {role === "super_admin" && (
              <button
                onClick={() => startImpersonation(person)}
                className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors"
                title={`View app as ${person.full_name}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Impersonate
              </button>
            )}
            {status !== "joined" && person.email && inviteFormId !== person.id && (
              <>
                <button
                  onClick={() => {
                    setInviteFormId(person.id);
                    setInviteRole(person.vendor_id ? "vendor" : "user");
                    setInviteVendorId(person.vendor_id || "");
                  }}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Invite
                </button>
                <button
                  onClick={() => handleResendInvite(person)}
                  disabled={invitingId === person.id}
                  className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                  {invitingId === person.id ? "Sending..." : "Resend"}
                </button>
              </>
            )}
            {inviteFormId === person.id && (
              <div className="flex items-center gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="vendor">Vendor</option>
                </select>
                {inviteRole === "vendor" && (
                  <select
                    value={inviteVendorId}
                    onChange={(e) => setInviteVendorId(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select vendor...</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => handleInvite(person)}
                  disabled={invitingId === person.id || (inviteRole === "vendor" && !inviteVendorId)}
                  className="text-xs font-medium text-white bg-blue-600 rounded px-2.5 py-1 hover:bg-blue-700 disabled:opacity-50"
                >
                  {invitingId === person.id ? "Sending..." : "Send"}
                </button>
                <button
                  onClick={() => { setInviteFormId(null); setInviteRole("user"); setInviteVendorId(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {status === "joined" && person.profile_id && (() => {
              const linkedProfile = profiles.find((pr) => pr.id === person.profile_id);
              if (linkedProfile?.role === "super_admin") return null;
              return (
                <button
                  onClick={async () => {
                    if (!confirm(`Deactivate ${person.full_name}? They will lose access.`)) return;
                    await fetch("/api/users/deactivate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user_id: person.profile_id }),
                    });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Deactivate
                </button>
              );
            })()}
            <button
              onClick={() => { if (confirm(`Delete ${person.full_name}?`)) handleDelete(person.id); }}
              className="text-gray-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          </div>
        </div>
      </div>
    );
  }

  function renderAddForm(isInternal: boolean) {
    return (
      <div className="bg-blue-50 border-b border-blue-200 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && addName.trim()) handleAdd(isInternal); if (e.key === "Escape") { setAddingInternal(false); setAddingExternal(false); setAddName(""); } }}
            placeholder="Full name..."
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <button
            onClick={() => handleAdd(isInternal)}
            disabled={!addName.trim()}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => { setAddingInternal(false); setAddingExternal(false); setAddName(""); }}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">People</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-300">
        <button
          onClick={() => { setActiveTab("internal"); setExpandedId(null); }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "internal"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          Internal Team ({internal.length})
        </button>
        <button
          onClick={() => { setActiveTab("vendors"); setExpandedId(null); }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "vendors"
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          Vendors ({external.length})
        </button>
      </div>

      {/* Internal Team Tab */}
      {activeTab === "internal" && (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Internal Team ({internal.length})</h2>
            {canEdit && (
              <button
                onClick={() => { setAddingInternal(!addingInternal); setAddingExternal(false); setAddName(""); }}
                className="text-xs text-blue-300 hover:text-white transition-colors"
              >
                + Add Person
              </button>
            )}
          </div>
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 overflow-hidden">
            {addingInternal && renderAddForm(true)}
            {internal.length === 0 && !addingInternal ? (
              <p className="text-sm text-gray-500 p-4">No internal contacts.</p>
            ) : (
              internal.map((p) => {
                const status = getContactStatus(p);
                const badge = statusBadge(status);
                return (
                  <Fragment key={p.id}>
                    <div
                      className={`px-4 py-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 cursor-pointer flex items-center gap-4 ${expandedId === p.id ? "bg-gray-50" : ""}`}
                      onClick={() => canEdit && setExpandedId(expandedId === p.id ? null : p.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900">{p.full_name}</p>
                        {p.title && <p className="text-xs text-gray-500">{p.title}</p>}
                      </div>
                      {p.email && <span className="text-xs text-gray-500 truncate">{p.email}</span>}
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${badge.className}`}>{badge.label}</span>
                    </div>
                    {expandedId === p.id && canEdit && renderEditPanel(p)}
                  </Fragment>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Vendor Contacts Tab */}
      {activeTab === "vendors" && (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Contacts ({external.length})</h2>
            {canEdit && (
              <button
                onClick={() => { setAddingExternal(!addingExternal); setAddingInternal(false); setAddName(""); }}
                className="text-xs text-blue-300 hover:text-white transition-colors"
              >
                + Add Contact
              </button>
            )}
          </div>
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 overflow-hidden">
            {addingExternal && renderAddForm(false)}
            {external.length === 0 && !addingExternal ? (
              <p className="text-sm text-gray-500 p-4">No vendor contacts.</p>
            ) : (
              vendorGroups.map(([vendorName, group]) => {
                const isVendorExpanded = expandedVendors.has(vendorName);
                return (
                  <div key={vendorName} className="border-b border-gray-200 last:border-b-0">
                    <div
                      className="px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedVendors((prev) => {
                        const next = new Set(prev);
                        if (next.has(vendorName)) next.delete(vendorName);
                        else next.add(vendorName);
                        return next;
                      })}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={`transition-transform flex-shrink-0 ${isVendorExpanded ? "rotate-90" : ""}`}>
                        <polygon points="6,4 20,12 6,20" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">{vendorName}</span>
                      <span className="text-xs text-gray-400">({group.people.length})</span>
                    </div>
                    {isVendorExpanded && group.people.map((p) => {
                      const status = getContactStatus(p);
                      const badge = statusBadge(status);
                      return (
                        <Fragment key={p.id}>
                          <div
                            className={`pl-10 pr-4 py-2.5 border-t border-gray-200 hover:bg-gray-50 cursor-pointer flex items-center gap-4 ${expandedId === p.id ? "bg-gray-50" : ""}`}
                            onClick={() => canEdit && setExpandedId(expandedId === p.id ? null : p.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm text-gray-900">{p.full_name}</p>
                              {p.title && <p className="text-xs text-gray-500">{p.title}</p>}
                            </div>
                            {p.email && <span className="text-xs text-gray-500 truncate">{p.email}</span>}
                            <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${badge.className}`}>{badge.label}</span>
                          </div>
                          {expandedId === p.id && canEdit && renderEditPanel(p)}
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}

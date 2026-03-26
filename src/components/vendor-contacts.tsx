"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import type { Person } from "@/lib/types";

type InvitationRef = { id: string; email: string; accepted_at: string | null };
type ContactStatus = "joined" | "invited" | "added";

export function VendorContacts({ initialContacts, vendorId, orgId, initialInvitations }: {
  initialContacts: Person[];
  vendorId: string;
  orgId: string;
  initialInvitations: InvitationRef[];
}) {
  const { role, profileId } = useRole();
  const canEdit = role === "super_admin" || role === "admin";
  const [contacts, setContacts] = useState<Person[]>(initialContacts);
  const [invitations, setInvitations] = useState<InvitationRef[]>(initialInvitations);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const supabase = createClient();

  function getStatus(person: Person): ContactStatus {
    if (person.profile_id) return "joined";
    if (person.email && invitations.some((inv) => inv.email.toLowerCase() === person.email!.toLowerCase() && !inv.accepted_at)) return "invited";
    return "added";
  }

  function statusBadgeStyle(status: ContactStatus) {
    switch (status) {
      case "joined": return "text-green-700 bg-green-100";
      case "invited": return "text-blue-700 bg-blue-100";
      case "added": return "text-gray-700 bg-gray-100";
    }
  }

  function statusLabel(status: ContactStatus) {
    switch (status) {
      case "joined": return "Joined";
      case "invited": return "Invited";
      case "added": return "Added";
    }
  }

  function saveField(id: string, field: string, value: string | null) {
    supabase.from("people").update({ [field]: value }).eq("id", id).then(() => {});
    setContacts((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  }

  async function addContact() {
    if (!addName.trim()) return;
    const { data, error } = await supabase.from("people").insert({
      org_id: orgId,
      full_name: addName.trim(),
      vendor_id: vendorId,
      is_internal: false,
      created_by: profileId,
    }).select("*").single();
    if (!error && data) {
      setContacts((prev) => [...prev, data as Person].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setAddName("");
      setAdding(false);
    }
  }

  async function handleInvite(person: Person) {
    if (!person.email) return;
    setInvitingId(person.id);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: person.email,
          role: "vendor",
          vendor_id: vendorId,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setInvitations((prev) => [...prev, { id: result.invitation.id, email: person.email!, accepted_at: null }]);
      } else {
        alert(result.error || "Failed to send invitation");
      }
    } catch {
      alert("Failed to send invitation");
    } finally {
      setInvitingId(null);
    }
  }

  async function deleteContact(person: Person) {
    const status = getStatus(person);

    // If they have an active invitation, cancel it first
    if (status === "invited" && person.email) {
      const inv = invitations.find((i) => i.email.toLowerCase() === person.email!.toLowerCase() && !i.accepted_at);
      if (inv) {
        await fetch("/api/invite/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitation_id: inv.id }),
        });
        setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      }
    }

    // If they have joined (have a profile), deactivate their account
    if (status === "joined" && person.profile_id) {
      await fetch("/api/users/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: person.profile_id }),
      });
    }

    // Delete the person record
    const { error } = await supabase.from("people").delete().eq("id", person.id);
    if (!error) {
      setContacts((prev) => prev.filter((p) => p.id !== person.id));
      if (expandedId === person.id) setExpandedId(null);
    }
  }

  return (
    <section>
      <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg flex items-center justify-between">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Contacts ({contacts.length})</h2>
        {canEdit && (
          <button onClick={() => setAdding(true)} className="text-xs font-medium text-white hover:text-gray-200">+ Add Contact</button>
        )}
      </div>
      {adding && (
        <div className="bg-blue-50 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addContact(); if (e.key === "Escape") { setAdding(false); setAddName(""); } }}
            placeholder="Full name..."
            autoFocus
            className="flex-1 text-sm rounded border border-gray-300 px-2 py-1.5 bg-white focus:border-blue-500 focus:outline-none"
          />
          <button onClick={addContact} disabled={!addName.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">Add</button>
          <button onClick={() => { setAdding(false); setAddName(""); }} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800">Cancel</button>
        </div>
      )}
      {contacts.length === 0 && !adding && (
        <div className="px-4 py-6 text-center text-sm text-gray-500 border border-t-0 border-gray-300 rounded-b-lg">No contacts for this vendor.</div>
      )}
      {contacts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {contacts.map((person) => {
            const isExpanded = expandedId === person.id;
            const status = getStatus(person);
            return (
              <div
                key={person.id}
                className={`bg-white rounded-lg border cursor-pointer transition-colors ${isExpanded ? "border-blue-400" : "border-gray-300 hover:border-blue-400"}`}
                onClick={() => setExpandedId(isExpanded ? null : person.id)}
              >
                <div className="p-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{person.full_name}</p>
                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusBadgeStyle(status)}`}>
                      {statusLabel(status)}
                    </span>
                  </div>
                  {person.title && <p className="text-xs text-gray-500">{person.title}</p>}
                  {!isExpanded && person.email && (
                    <p className="text-xs text-blue-600 mt-0.5">{person.email}</p>
                  )}
                </div>
                {isExpanded && canEdit && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-[60px_1fr] gap-1.5 items-center">
                      <label className="text-xs font-medium text-gray-400">Name</label>
                      <input
                        type="text"
                        defaultValue={person.full_name}
                        onBlur={(e) => { if (e.target.value !== person.full_name) saveField(person.id, "full_name", e.target.value); }}
                        className="text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                      />
                      <label className="text-xs font-medium text-gray-400">Title</label>
                      <input
                        type="text"
                        defaultValue={person.title || ""}
                        onBlur={(e) => { if (e.target.value !== (person.title || "")) saveField(person.id, "title", e.target.value || null); }}
                        placeholder="—"
                        className="text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                      />
                      <label className="text-xs font-medium text-gray-400">Email</label>
                      <input
                        type="email"
                        defaultValue={person.email || ""}
                        onBlur={(e) => { if (e.target.value !== (person.email || "")) saveField(person.id, "email", e.target.value || null); }}
                        placeholder="—"
                        className="text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                      />
                      <label className="text-xs font-medium text-gray-400">Phone</label>
                      <input
                        type="tel"
                        defaultValue={person.phone || ""}
                        onBlur={(e) => { if (e.target.value !== (person.phone || "")) saveField(person.id, "phone", e.target.value || null); }}
                        placeholder="—"
                        className="text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                      />
                      <label className="text-xs font-medium text-gray-400">Slack ID</label>
                      <input
                        type="text"
                        defaultValue={person.slack_member_id || ""}
                        onBlur={(e) => { if (e.target.value !== (person.slack_member_id || "")) saveField(person.id, "slack_member_id", e.target.value || null); }}
                        placeholder="U0XXXXXXXX"
                        className="text-sm rounded border border-gray-300 px-2 py-1 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      {/* Invite button — only for "added" contacts with email */}
                      {status === "added" && person.email ? (
                        <button
                          onClick={() => handleInvite(person)}
                          disabled={invitingId === person.id}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {invitingId === person.id ? "Sending..." : "Invite to Tracker"}
                        </button>
                      ) : <span />}
                      <button
                        onClick={() => { if (confirm(`Delete ${person.full_name}?${status === "joined" ? " This will also revoke their access." : ""}`)) deleteContact(person); }}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                {isExpanded && !canEdit && (
                  <div className="px-3 pb-3 border-t border-gray-100 pt-2 text-xs text-gray-500 space-y-1" onClick={(e) => e.stopPropagation()}>
                    {person.email && <p>Email: <a href={`mailto:${person.email}`} className="text-blue-600 hover:underline">{person.email}</a></p>}
                    {person.phone && <p>Phone: {person.phone}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

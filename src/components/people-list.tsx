"use client";

import { useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-context";
import { isAdmin } from "@/lib/permissions";
import Link from "next/link";
import type { Person, Vendor, Profile } from "@/lib/types";

type PersonRow = Person & { vendor: Vendor | null };

interface PeopleListProps {
  initialPeople: PersonRow[];
  vendors: Vendor[];
  profiles: Pick<Profile, "id" | "role" | "vendor_id" | "full_name">[];
}

export default function PeopleList({ initialPeople, vendors, profiles }: PeopleListProps) {
  const { role } = useRole();
  const [people, setPeople] = useState<PersonRow[]>(initialPeople);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = createClient();

  const internal = people.filter((p) => p.is_internal);
  const external = people.filter((p) => !p.is_internal);
  const canEdit = isAdmin(role);

  function saveField(id: string, field: string, value: string | boolean | null) {
    const dbUpdates: Record<string, unknown> = { [field]: value };

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

  function startImpersonation(person: PersonRow) {
    // Find linked profile for this person
    const linkedProfile = person.profile_id ? profiles.find((pr) => pr.id === person.profile_id) : null;

    const impersonation = {
      personId: person.id,
      personName: person.full_name,
      role: linkedProfile?.role || (person.vendor_id ? "vendor" : "user"),
      vendorId: person.vendor_id || linkedProfile?.vendor_id || null,
    };

    sessionStorage.setItem("impersonation", JSON.stringify(impersonation));
    // Trigger a storage event for the role context to pick up
    window.dispatchEvent(new Event("impersonation-change"));
  }

  function renderEditPanel(person: PersonRow) {
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
          <label className="text-xs font-medium text-gray-400">Vendor</label>
          <select
            defaultValue={person.vendor_id || ""}
            onChange={(e) => saveField(person.id, "vendor_id", e.target.value || null)}
            className="text-sm rounded border border-gray-300 px-2 py-1.5 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <label className="text-xs font-medium text-gray-400">Internal</label>
          <div>
            <input
              type="checkbox"
              defaultChecked={person.is_internal}
              onChange={(e) => saveField(person.id, "is_internal", e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
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
        <div className="flex items-center justify-between mt-3 max-w-3xl">
          <div className="flex items-center gap-2">
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
          </div>
          <button
            onClick={() => { if (confirm(`Delete ${person.full_name}?`)) handleDelete(person.id); }}
            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">People</h1>

      {/* Internal Team */}
      <section>
        <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Internal Team ({internal.length})</h2>
        </div>
        {internal.length === 0 ? (
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 p-4">
            <p className="text-sm text-gray-500">No internal contacts.</p>
          </div>
        ) : (
          <div className="bg-white rounded-b-lg border border-t-0 border-gray-300 overflow-hidden">
            {internal.map((p) => (
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
                </div>
                {expandedId === p.id && canEdit && renderEditPanel(p)}
              </Fragment>
            ))}
          </div>
        )}
      </section>

      {/* External Contacts */}
      <section>
        {external.length === 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Vendor Contacts</h2>
            <p className="text-sm text-gray-500">No vendor contacts.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Vendor Contacts ({external.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                </tr>
              </thead>
              <tbody>
                {external.map((p) => (
                  <Fragment key={p.id}>
                    <tr
                      className={`border-b border-gray-200 hover:bg-gray-50 ${canEdit ? "cursor-pointer" : ""} ${expandedId === p.id ? "bg-gray-50" : ""}`}
                      onClick={() => canEdit && setExpandedId(expandedId === p.id ? null : p.id)}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{p.full_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.title || "—"}</td>
                      <td className="px-4 py-3 text-sm">
                        {p.vendor ? (
                          <Link href={`/settings/vendors/${p.vendor.id}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                            {p.vendor.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {p.email ? (
                          <span className="text-blue-600">{p.email}</span>
                        ) : "—"}
                      </td>
                    </tr>
                    {expandedId === p.id && canEdit && (
                      <tr>
                        <td colSpan={4} className="p-0">
                          {renderEditPanel(p)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

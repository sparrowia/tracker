"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Vendor } from "@/lib/types";

interface VendorWithCounts extends Vendor {
  actionCount: number;
  blockerCount: number;
  peopleCount: number;
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVendor, setModalVendor] = useState<VendorWithCounts | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", slug: "", website: "", notes: "" });
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const [{ data: vendorData }, { data: actions }, { data: blockers }, { data: people }] =
        await Promise.all([
          supabase.from("vendors").select("*").order("name"),
          supabase.from("action_items").select("vendor_id").neq("status", "complete").not("vendor_id", "is", null),
          supabase.from("blockers").select("vendor_id").is("resolved_at", null).not("vendor_id", "is", null),
          supabase.from("people").select("vendor_id").not("vendor_id", "is", null),
        ]);

      const actionCounts = new Map<string, number>();
      const blockerCounts = new Map<string, number>();
      const peopleCounts = new Map<string, number>();

      for (const a of actions || []) actionCounts.set(a.vendor_id, (actionCounts.get(a.vendor_id) || 0) + 1);
      for (const b of blockers || []) blockerCounts.set(b.vendor_id, (blockerCounts.get(b.vendor_id) || 0) + 1);
      for (const p of people || []) peopleCounts.set(p.vendor_id, (peopleCounts.get(p.vendor_id) || 0) + 1);

      setVendors(
        ((vendorData || []) as Vendor[]).map((v) => ({
          ...v,
          actionCount: actionCounts.get(v.id) || 0,
          blockerCount: blockerCounts.get(v.id) || 0,
          peopleCount: peopleCounts.get(v.id) || 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  function openModal(v: VendorWithCounts, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setModalVendor(v);
    setEditing(false);
    setEditForm({ name: v.name, slug: v.slug, website: v.website || "", notes: v.notes || "" });
  }

  function closeModal() {
    setModalVendor(null);
    setEditing(false);
  }

  function startEdit() {
    if (!modalVendor) return;
    setEditForm({
      name: modalVendor.name,
      slug: modalVendor.slug,
      website: modalVendor.website || "",
      notes: modalVendor.notes || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!modalVendor) return;
    const { error } = await supabase
      .from("vendors")
      .update({
        name: editForm.name,
        slug: editForm.slug,
        website: editForm.website || null,
        notes: editForm.notes || null,
      })
      .eq("id", modalVendor.id);

    if (!error) {
      const updated = {
        ...modalVendor,
        name: editForm.name,
        slug: editForm.slug,
        website: editForm.website || null,
        notes: editForm.notes || null,
      };
      setVendors((prev) =>
        prev.map((v) => (v.id === modalVendor.id ? updated : v)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setModalVendor(updated);
      setEditing(false);
    }
  }

  async function handleDelete() {
    if (!modalVendor) return;
    await supabase.from("vendors").delete().eq("id", modalVendor.id);
    setVendors((prev) => prev.filter((v) => v.id !== modalVendor.id));
    closeModal();
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-gray-500">Loading vendors...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Vendors</h1>

      {vendors.length === 0 ? (
        <p className="text-sm text-gray-500">No vendors yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="relative bg-white rounded-lg border border-gray-300 p-5 hover:border-blue-400 transition-colors"
            >
              {/* View icon */}
              <button
                onClick={(e) => openModal(v, e)}
                className="absolute top-3 right-3 text-gray-300 hover:text-blue-600 transition-colors"
                title="View details"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="19" cy="12" r="1"/>
                  <circle cx="5" cy="12" r="1"/>
                </svg>
              </button>
              <h3 className={`font-semibold pr-6 ${v.blockerCount > 0 ? "text-red-600" : "text-gray-900"}`}>{v.name}</h3>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Open actions</span>
                  <span className="text-gray-900 font-medium">{v.actionCount}</span>
                </div>
                {v.blockerCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Blockers</span>
                    <span className="text-red-600 font-medium">{v.blockerCount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Contacts</span>
                  <span className="text-gray-900">{v.peopleCount}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? "Edit Vendor" : modalVendor.name}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-4">
              {editing ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
                    <input
                      type="text"
                      value={editForm.slug}
                      onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
                    <input
                      type="text"
                      value={editForm.website}
                      onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                      placeholder="https://..."
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={3}
                      className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Slug</span>
                      <p className="text-gray-900 mt-0.5">{modalVendor.slug || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Website</span>
                      {modalVendor.website ? (
                        <a href={modalVendor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block mt-0.5">
                          {modalVendor.website}
                        </a>
                      ) : (
                        <p className="text-gray-400 mt-0.5">—</p>
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Open Actions</span>
                      <p className="text-gray-900 mt-0.5">{modalVendor.actionCount}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Active Blockers</span>
                      <p className={`mt-0.5 ${modalVendor.blockerCount > 0 ? "text-red-600 font-medium" : "text-gray-900"}`}>
                        {modalVendor.blockerCount}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Contacts</span>
                      <p className="text-gray-900 mt-0.5">{modalVendor.peopleCount}</p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">Created</span>
                      <p className="text-gray-900 mt-0.5">{new Date(modalVendor.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {modalVendor.notes && (
                    <div className="text-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase">Notes</span>
                      <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{modalVendor.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              {editing ? (
                <>
                  <div />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEdit}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={handleDelete}
                    className="text-sm text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete vendor
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={startEdit}
                      className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <Link
                      href={`/vendors/${modalVendor.id}`}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      View Full Page
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

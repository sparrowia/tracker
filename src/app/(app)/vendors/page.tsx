import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Vendor } from "@/lib/types";

export default async function VendorsPage() {
  const supabase = await createClient();

  // Fetch all data in parallel with bulk queries instead of per-vendor
  const [{ data: vendors }, { data: actions }, { data: blockers }, { data: people }] =
    await Promise.all([
      supabase.from("vendors").select("*").order("name"),
      supabase
        .from("action_items")
        .select("vendor_id")
        .neq("status", "complete")
        .not("vendor_id", "is", null),
      supabase
        .from("blockers")
        .select("vendor_id")
        .is("resolved_at", null)
        .not("vendor_id", "is", null),
      supabase
        .from("people")
        .select("vendor_id")
        .not("vendor_id", "is", null),
    ]);

  // Count per vendor client-side
  const actionCounts = new Map<string, number>();
  const blockerCounts = new Map<string, number>();
  const peopleCounts = new Map<string, number>();

  for (const a of actions || []) {
    actionCounts.set(a.vendor_id, (actionCounts.get(a.vendor_id) || 0) + 1);
  }
  for (const b of blockers || []) {
    blockerCounts.set(b.vendor_id, (blockerCounts.get(b.vendor_id) || 0) + 1);
  }
  for (const p of people || []) {
    peopleCounts.set(p.vendor_id, (peopleCounts.get(p.vendor_id) || 0) + 1);
  }

  const vendorList = ((vendors || []) as Vendor[]).map((v) => ({
    ...v,
    actionCount: actionCounts.get(v.id) || 0,
    blockerCount: blockerCounts.get(v.id) || 0,
    peopleCount: peopleCounts.get(v.id) || 0,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Vendors</h1>

      {vendorList.length === 0 ? (
        <p className="text-sm text-gray-500">No vendors yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendorList.map((v) => (
            <Link
              key={v.id}
              href={`/vendors/${v.id}`}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 transition-colors"
            >
              <h3 className="font-semibold text-gray-900">{v.name}</h3>
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
    </div>
  );
}

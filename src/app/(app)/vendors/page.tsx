import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Vendor } from "@/lib/types";

export default async function VendorsPage() {
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  const vendorsWithCounts = await Promise.all(
    ((vendors || []) as Vendor[]).map(async (vendor) => {
      const { count: actionCount } = await supabase
        .from("action_items")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", vendor.id)
        .neq("status", "complete");

      const { count: blockerCount } = await supabase
        .from("blockers")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", vendor.id)
        .is("resolved_at", null);

      const { count: peopleCount } = await supabase
        .from("people")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", vendor.id);

      return {
        ...vendor,
        actionCount: actionCount || 0,
        blockerCount: blockerCount || 0,
        peopleCount: peopleCount || 0,
      };
    })
  );

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Vendors</h1>

      {vendorsWithCounts.length === 0 ? (
        <p className="text-sm text-gray-500">No vendors yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendorsWithCounts.map((v) => (
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

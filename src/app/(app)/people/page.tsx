import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Person, Vendor } from "@/lib/types";

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("*, vendor:vendors(*)")
    .order("is_internal", { ascending: false })
    .order("full_name");

  const people = (data || []) as (Person & { vendor: Vendor | null })[];
  const internal = people.filter((p) => p.is_internal);
  const external = people.filter((p) => !p.is_internal);

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {internal.map((p) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-300 p-4">
                <p className="font-medium text-gray-900">{p.full_name}</p>
                {p.title && <p className="text-sm text-gray-500">{p.title}</p>}
                {p.email && (
                  <a href={`mailto:${p.email}`} className="text-sm text-blue-600 hover:underline block mt-1">
                    {p.email}
                  </a>
                )}
              </div>
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
                  <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{p.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.title || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {p.vendor ? (
                        <Link href={`/vendors/${p.vendor.id}`} className="text-blue-600 hover:underline">
                          {p.vendor.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="text-blue-600 hover:underline">
                          {p.email}
                        </a>
                      ) : "—"}
                    </td>
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

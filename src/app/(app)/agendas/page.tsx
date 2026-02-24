import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { Vendor } from "@/lib/types";

export default async function AgendasPage() {
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Meeting Agendas</h1>
      <p className="text-sm text-gray-500 mb-6">
        Generate prioritized agendas for vendor meetings.
      </p>

      {!vendors || vendors.length === 0 ? (
        <p className="text-sm text-gray-500">No vendors yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(vendors as Vendor[]).map((v) => (
            <Link
              key={v.id}
              href={`/agendas/${v.slug}`}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 transition-colors"
            >
              <h3 className="font-semibold text-gray-900">{v.name}</h3>
              <p className="text-sm text-gray-500 mt-1">Generate meeting agenda</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

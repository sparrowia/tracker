import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Vendor, VendorAccountabilityRow } from "@/lib/types";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .single();

  if (!vendor) notFound();

  const v = vendor as Vendor;

  const { data: accountability, error: accError } = await supabase
    .from("vendor_accountability")
    .select("*")
    .eq("vendor_id", v.id);

  const items = (accountability || []) as VendorAccountabilityRow[];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{v.name}</h1>
      <p className="text-sm text-gray-600">Items: {items.length}</p>
      {accError && <p className="text-red-600">Error: {accError.message}</p>}
      <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-64">{JSON.stringify(items.slice(0, 3), null, 2)}</pre>
    </div>
  );
}

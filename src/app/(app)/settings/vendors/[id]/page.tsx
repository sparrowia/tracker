import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Vendor, Person, VendorAccountabilityRow } from "@/lib/types";
import { VendorContacts } from "@/components/vendor-contacts";

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

  const [{ data: accountability }, { data: contacts }, { data: allPeople }, { data: invitationData }] =
    await Promise.all([
      supabase.from("vendor_accountability").select("*").eq("vendor_id", v.id),
      supabase.from("people").select("*").eq("vendor_id", v.id).order("full_name"),
      supabase.from("people").select("*").eq("org_id", v.org_id).order("full_name"),
      supabase.from("invitations").select("id, email, accepted_at").eq("vendor_id", v.id),
    ]);

  const items = (accountability || []) as VendorAccountabilityRow[];
  const people = (contacts || []) as Person[];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{v.name}</h1>
        {v.website && (
          <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            {v.website}
          </a>
        )}
      </div>

      {/* Step 1: Contacts */}
      <VendorContacts initialContacts={people} vendorId={v.id} orgId={v.org_id} initialInvitations={(invitationData || []) as { id: string; email: string; accepted_at: string | null }[]} />

      <p className="text-sm text-gray-500">Open items: {items.length}</p>
    </div>
  );
}

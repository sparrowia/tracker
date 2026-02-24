import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { AgendaView } from "@/components/agenda-view";
import type { Vendor, VendorAgendaRow } from "@/lib/types";

export default async function VendorAgendaPage({
  params,
}: {
  params: Promise<{ vendorSlug: string }>;
}) {
  const { vendorSlug } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("slug", vendorSlug)
    .single();

  if (!vendor) notFound();

  const v = vendor as Vendor;

  const { data: agendaRows } = await supabase.rpc("generate_vendor_agenda", {
    p_vendor_id: v.id,
    p_limit: 20,
  });

  return (
    <div className="max-w-5xl mx-auto">
      <AgendaView vendor={v} initialItems={(agendaRows || []) as VendorAgendaRow[]} />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Vendor, Person, VendorAccountabilityRow, Project } from "@/lib/types";
import { VendorAgendaView } from "@/components/vendor-agenda-view";
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

  const [{ data: accountability }, { data: contacts }, { data: projects }, { data: allPeople }, { data: invitationData }] =
    await Promise.all([
      supabase.from("vendor_accountability").select("*").eq("vendor_id", v.id),
      supabase.from("people").select("*").eq("vendor_id", v.id).order("full_name"),
      supabase.from("project_vendors").select("project:projects(*)").eq("vendor_id", v.id),
      supabase.from("people").select("*").eq("org_id", v.org_id).order("full_name"),
      supabase.from("invitations").select("id, email, accepted_at").eq("vendor_id", v.id),
    ]);

  const items = (accountability || []) as VendorAccountabilityRow[];
  const people = (contacts || []) as Person[];
  const peopleList = (allPeople || []) as Person[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorProjects = ((projects || []).map((p: any) => p.project).filter(Boolean)) as Project[];

  // Related projects — plain array, no Set/Map
  const seenProjectIds: Record<string, boolean> = {};
  const relatedProjectsList: { id: string; name: string; slug: string }[] = [];
  for (const p of vendorProjects) {
    if (!seenProjectIds[p.id]) { seenProjectIds[p.id] = true; relatedProjectsList.push({ id: p.id, name: p.name, slug: p.slug }); }
  }
  for (const item of items) {
    if (item.project_id && !seenProjectIds[item.project_id]) {
      seenProjectIds[item.project_id] = true;
      // We don't have the name/slug for these yet — skip for now
    }
  }
  relatedProjectsList.sort((a, b) => a.name.localeCompare(b.name));

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

      {relatedProjectsList.length > 0 && (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Related Projects</h2>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {relatedProjectsList.map((proj) => (
              <Link key={proj.id} href={`/projects/${proj.slug}`} className="inline-flex px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">
                {proj.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <VendorAgendaView vendor={v} people={peopleList} />
      </section>

      <p className="text-sm text-gray-500">Open items: {items.length}</p>
    </div>
  );
}

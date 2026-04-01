import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { priorityColor, priorityLabel, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
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
      supabase
        .from("vendor_accountability")
        .select("*")
        .eq("vendor_id", v.id),
      supabase
        .from("people")
        .select("*")
        .eq("vendor_id", v.id)
        .order("full_name"),
      supabase
        .from("project_vendors")
        .select("project:projects(*)")
        .eq("vendor_id", v.id),
      supabase
        .from("people")
        .select("*")
        .eq("org_id", v.org_id)
        .order("full_name"),
      supabase
        .from("invitations")
        .select("id, email, accepted_at")
        .eq("vendor_id", v.id),
    ]);

  const items = (accountability || []) as VendorAccountabilityRow[];
  const people = (contacts || []) as Person[];
  const peopleList = (allPeople || []) as Person[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorProjects = ((projects || []).map((p: any) => p.project).filter(Boolean)) as Project[];

  // Fetch owner and project names for accountability items
  const ownerIds = [...new Set(items.map((i) => i.owner_id).filter(Boolean))];
  const projectIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))];

  // Also get project IDs from action_items, blockers, raid_entries, agenda_items for this vendor
  const [{ data: aiProjs }, { data: blProjs }, { data: reProjs }, { data: agProjs }] = await Promise.all([
    supabase.from("action_items").select("project_id").eq("vendor_id", v.id).not("project_id", "is", null),
    supabase.from("blockers").select("project_id").eq("vendor_id", v.id).not("project_id", "is", null),
    supabase.from("raid_entries").select("project_id").eq("vendor_id", v.id).not("project_id", "is", null),
    supabase.from("agenda_items").select("project_id").eq("vendor_id", v.id).not("project_id", "is", null),
  ]);
  const allVendorProjectIds = new Set([
    ...projectIds,
    ...(aiProjs || []).map((r: { project_id: string }) => r.project_id),
    ...(blProjs || []).map((r: { project_id: string }) => r.project_id),
    ...(reProjs || []).map((r: { project_id: string }) => r.project_id),
    ...(agProjs || []).map((r: { project_id: string }) => r.project_id),
  ]);

  const [{ data: owners }, { data: relatedProjects }] = await Promise.all([
    ownerIds.length > 0
      ? supabase.from("people").select("id, full_name").in("id", ownerIds)
      : { data: [] },
    allVendorProjectIds.size > 0
      ? supabase.from("projects").select("id, name, slug").in("id", [...allVendorProjectIds])
      : { data: [] },
  ]);

  const ownerMap = new Map((owners || []).map((o: { id: string; full_name: string }) => [o.id, o.full_name]));
  const projectMap = new Map((relatedProjects || []).map((p: { id: string; name: string; slug: string }) => [p.id, p]));

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

      {/* Contacts */}
      <VendorContacts initialContacts={people} vendorId={v.id} orgId={v.org_id} initialInvitations={(invitationData || []) as { id: string; email: string; accepted_at: string | null }[]} />

      {/* Related Projects — derived from all items linked to this vendor */}
      {(() => {
        // Combine project_vendors projects with projects from accountability items
        const allProjectIds = new Set<string>();
        for (const p of vendorProjects) allProjectIds.add(p.id);
        for (const item of items) {
          if (item.project_id) allProjectIds.add(item.project_id);
        }
        const allProjects = [...allProjectIds].map((pid) => {
          const fromVendor = vendorProjects.find((p) => p.id === pid);
          if (fromVendor) return fromVendor;
          const fromMap = projectMap.get(pid);
          if (fromMap) return fromMap as { id: string; name: string; slug: string };
          return null;
        }).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name));
        return allProjects.length > 0 ? (
          <section>
            <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Related Projects</h2>
            </div>
            <div className="flex gap-2 flex-wrap mt-3">
              {allProjects.map((proj) => (
                <Link
                  key={proj!.id}
                  href={`/projects/${proj!.slug}`}
                  className="inline-flex px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {proj!.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null;
      })()}

      {/* Meeting Agenda — temporarily disabled for debugging */}
      {/* <section>
        <VendorAgendaView vendor={v} people={peopleList} />
      </section> */}

      {/* Accountability */}
      <section>
        {items.length === 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Open Items</h2>
            <p className="text-sm text-gray-500">No open items for this vendor.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2.5">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Open Items ({items.length})</h2>
            </div>
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-300">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = statusBadge(item.status);
                  const proj = item.project_id ? projectMap.get(item.project_id) : null;
                  const ownerName = item.owner_id ? ownerMap.get(item.owner_id) : null;
                  return (
                    <tr key={`${item.entity_type}-${item.entity_id}`} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${
                          item.entity_type === "blocker" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {item.entity_type === "blocker" ? "Blocker" : "Action"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{item.title}</td>
                      <td className="px-4 py-3 text-sm">
                        {ownerName ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-100 text-[10px] font-medium text-blue-700 flex items-center justify-center flex-shrink-0">
                              {ownerName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-gray-700">{ownerName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {proj ? (
                          <Link href={`/projects/${(proj as { slug: string }).slug}`} className="text-blue-600 hover:underline">
                            {(proj as { name: string }).name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${priorityColor(item.priority)}`}>
                          {priorityLabel(item.priority)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(item.due_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatAge(item.age_days)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

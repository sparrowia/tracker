import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { priorityColor, statusBadge, formatAge, formatDateShort } from "@/lib/utils";
import type { Vendor, Person, VendorAccountabilityRow, Project } from "@/lib/types";

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

  const [{ data: accountability }, { data: contacts }, { data: projects }] =
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
    ]);

  const items = (accountability || []) as VendorAccountabilityRow[];
  const people = (contacts || []) as Person[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorProjects = ((projects || []).map((p: any) => p.project).filter(Boolean)) as Project[];

  // Fetch owner and project names for accountability items
  const ownerIds = [...new Set(items.map((i) => i.owner_id).filter(Boolean))];
  const projectIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))];

  const [{ data: owners }, { data: relatedProjects }] = await Promise.all([
    ownerIds.length > 0
      ? supabase.from("people").select("id, full_name").in("id", ownerIds)
      : { data: [] },
    projectIds.length > 0
      ? supabase.from("projects").select("id, name, slug").in("id", projectIds)
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
        <div className="flex gap-2 mt-3">
          <Link
            href={`/agendas/${v.slug}`}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Generate Agenda
          </Link>
        </div>
      </div>

      {/* Contacts */}
      {people.length > 0 && (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Contacts</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            {people.map((person) => (
              <div key={person.id} className="bg-white rounded-lg border border-gray-300 p-3">
                <p className="font-medium text-gray-900 text-sm">{person.full_name}</p>
                {person.title && <p className="text-xs text-gray-500">{person.title}</p>}
                {person.email && (
                  <a href={`mailto:${person.email}`} className="text-xs text-blue-600 hover:underline">
                    {person.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Related Projects */}
      {vendorProjects.length > 0 && (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Related Projects</h2>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {vendorProjects.map((proj) => (
              <Link
                key={proj.id}
                href={`/projects/${proj.slug}`}
                className="inline-flex px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                {proj.name}
              </Link>
            ))}
          </div>
        </section>
      )}

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
                          {item.priority}
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

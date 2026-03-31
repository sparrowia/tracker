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
  try {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .single();

  if (!vendor) notFound();

  const v = vendor as Vendor;

  let items: VendorAccountabilityRow[] = [];
  let people: Person[] = [];
  let peopleList: Person[] = [];
  let vendorProjects: Project[] = [];
  let ownerMap = new Map<string, string>();
  let projectMap = new Map<string, { id: string; name: string; slug: string }>();
  let invitations: { id: string; email: string; accepted_at: string | null }[] = [];

  try {
    const [{ data: accountability, error: accErr }, { data: contacts }, { data: projects }, { data: allPeople }, { data: invitationData }] =
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

    if (accErr) console.error("vendor_accountability error:", accErr);

    items = (accountability || []) as VendorAccountabilityRow[];
    people = (contacts || []) as Person[];
    peopleList = (allPeople || []) as Person[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vendorProjects = ((projects || []).map((p: any) => p.project).filter(Boolean)) as Project[];
    invitations = (invitationData || []) as { id: string; email: string; accepted_at: string | null }[];

    // Fetch owner and project names for accountability items
    const ownerIds = [...new Set(items.map((i) => i.owner_id).filter(Boolean))] as string[];
    const projectIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))] as string[];

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
        : { data: [] as { id: string; full_name: string }[] },
      allVendorProjectIds.size > 0
        ? supabase.from("projects").select("id, name, slug").in("id", [...allVendorProjectIds])
        : { data: [] as { id: string; name: string; slug: string }[] },
    ]);

    ownerMap = new Map((owners || []).map((o: { id: string; full_name: string }) => [o.id, o.full_name]));
    projectMap = new Map((relatedProjects || []).map((p: { id: string; name: string; slug: string }) => [p.id, p]));
  } catch (err) {
    console.error("Vendor detail page data error:", err);
    return (
      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-xl font-bold text-red-600 mb-4">Vendor Page Error</h1>
        <pre className="bg-red-50 p-4 rounded text-sm text-red-800 whitespace-pre-wrap">{String(err)}</pre>
        <pre className="bg-gray-50 p-4 rounded text-sm text-gray-800 mt-4 whitespace-pre-wrap">{err instanceof Error ? err.stack : ""}</pre>
      </div>
    );
  }

  // DEBUG: Render each section individually to isolate the crash
  const debugSections: { name: string; ok: boolean; error?: string }[] = [];

  // Test Section 1: Contacts
  let contactsSection = null;
  try {
    contactsSection = <VendorContacts initialContacts={people} vendorId={v.id} orgId={v.org_id} initialInvitations={invitations} />;
    debugSections.push({ name: "Contacts", ok: true });
  } catch (e) { debugSections.push({ name: "Contacts", ok: false, error: String(e) }); }

  // Test Section 2: Related Projects
  let relatedProjectsSection = null;
  try {
    const allProjectIds = new Set<string>();
    for (const p of vendorProjects) allProjectIds.add(p.id);
    for (const item of items) { if (item.project_id) allProjectIds.add(item.project_id); }
    const allProjects = [...allProjectIds].map((pid) => {
      const fromVendor = vendorProjects.find((p) => p.id === pid);
      if (fromVendor) return fromVendor;
      const fromMap = projectMap.get(pid);
      if (fromMap) return fromMap as { id: string; name: string; slug: string };
      return null;
    }).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name));
    if (allProjects.length > 0) {
      relatedProjectsSection = (
        <section>
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Related Projects</h2>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {allProjects.map((proj) => (
              <Link key={proj!.id} href={`/projects/${(proj as { slug: string }).slug}`} className="inline-flex px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200">
                {(proj as { name: string }).name}
              </Link>
            ))}
          </div>
        </section>
      );
    }
    debugSections.push({ name: "Related Projects", ok: true });
  } catch (e) { debugSections.push({ name: "Related Projects", ok: false, error: String(e) }); }

  // Test Section 3: Vendor Agenda
  let agendaSection = null;
  try {
    agendaSection = <VendorAgendaView vendor={v} people={peopleList} />;
    debugSections.push({ name: "Vendor Agenda", ok: true });
  } catch (e) { debugSections.push({ name: "Vendor Agenda", ok: false, error: String(e) }); }

  // Test Section 4: Open Items
  let openItemsSection = null;
  try {
    if (items.length === 0) {
      openItemsSection = (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Open Items</h2>
          <p className="text-sm text-gray-500">No open items for this vendor.</p>
        </div>
      );
    } else {
      const TYPE_LABELS: Record<string, string> = { action_item: "Action", blocker: "Blocker", raid_entry: "RAID" };
      const TYPE_COLORS: Record<string, string> = { action_item: "bg-blue-100 text-blue-700", blocker: "bg-red-100 text-red-700", raid_entry: "bg-amber-100 text-amber-700" };
      const groups = new Map<string, { project: { id: string; name: string; slug: string } | null; items: VendorAccountabilityRow[] }>();
      for (const item of items) {
        const key = item.project_id || "__none__";
        if (!groups.has(key)) {
          const proj = item.project_id ? projectMap.get(item.project_id) as { id: string; name: string; slug: string } | undefined : undefined;
          groups.set(key, { project: proj || null, items: [] });
        }
        groups.get(key)!.items.push(item);
      }
      const sorted = [...groups.entries()].sort(([, a], [, b]) => {
        if (!a.project && b.project) return 1;
        if (a.project && !b.project) return -1;
        return (a.project?.name || "").localeCompare(b.project?.name || "");
      });

      openItemsSection = (
        <div className="space-y-4">
          <div className="bg-gray-800 px-4 py-2.5 rounded-t-lg">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wide">Open Items ({items.length})</h2>
          </div>
          {sorted.map(([key, group]) => (
            <details key={key} open className="bg-white rounded-lg border border-gray-300 overflow-hidden">
              <summary className="bg-gray-700 px-4 py-2 cursor-pointer flex items-center justify-between">
                <span className="text-xs font-semibold text-white uppercase tracking-wide">
                  {group.project ? group.project.name : "No Project"} ({group.items.length})
                </span>
                {group.project && (
                  <Link href={`/projects/${group.project.slug}`} className="text-xs text-blue-300 hover:text-blue-200" onClick={(e) => e.stopPropagation()}>
                    View Project
                  </Link>
                )}
              </summary>
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Responsible</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => {
                    const badge = statusBadge(item.status);
                    const ownerName = item.owner_id ? ownerMap.get(item.owner_id) : null;
                    return (
                      <tr key={`${item.entity_type}-${item.entity_id}`} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-1.5 py-0.5 text-xs rounded ${TYPE_COLORS[item.entity_type] || "bg-gray-100 text-gray-700"}`}>
                            {TYPE_LABELS[item.entity_type] || item.entity_type}
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
            </details>
          ))}
        </div>
      );
    }
    debugSections.push({ name: "Open Items", ok: true });
  } catch (e) { debugSections.push({ name: "Open Items", ok: false, error: String(e) }); }

  const hasErrors = debugSections.some((s) => !s.ok);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Debug banner — shows which sections crashed */}
      {hasErrors && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-sm font-bold text-red-700 mb-2">Debug: Section render results</h2>
          {debugSections.map((s) => (
            <div key={s.name} className="text-xs">
              <span className={s.ok ? "text-green-700" : "text-red-700"}>{s.ok ? "OK" : "CRASH"}</span>
              {" "}{s.name}
              {s.error && <pre className="text-red-600 ml-4 whitespace-pre-wrap">{s.error}</pre>}
            </div>
          ))}
          <div className="mt-2 text-xs text-gray-500">Items: {items.length}, Projects: {vendorProjects.length}</div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{v.name}</h1>
        {v.website && (
          <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            {v.website}
          </a>
        )}
      </div>

      {contactsSection}
      {relatedProjectsSection}
      <section>{agendaSection}</section>
      <section>{openItemsSection}</section>
    </div>
  );
  } catch (err) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-xl font-bold text-red-600 mb-4">Vendor Page Debug — Top-Level Crash</h1>
        <pre className="bg-red-50 p-4 rounded text-sm text-red-800 whitespace-pre-wrap break-all">{String(err)}</pre>
        <pre className="bg-gray-50 p-4 rounded text-sm text-gray-600 mt-4 whitespace-pre-wrap break-all">{err instanceof Error ? err.stack : "No stack"}</pre>
      </div>
    );
  }
}

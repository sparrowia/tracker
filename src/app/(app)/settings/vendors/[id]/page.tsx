import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Vendor, Person, VendorAccountabilityRow, Project } from "@/lib/types";
import { VendorContacts } from "@/components/vendor-contacts";
import { VendorOpenItems } from "@/components/vendor-open-items";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendorProjects = ((projects || []).map((p: any) => p.project).filter(Boolean)) as Project[];

  // Build complete project list from project_vendors + projects referenced in items
  const seenProjectIds: Record<string, boolean> = {};
  const allProjectsList: { id: string; name: string; slug: string }[] = [];
  for (const p of vendorProjects) {
    if (!seenProjectIds[p.id]) { seenProjectIds[p.id] = true; allProjectsList.push({ id: p.id, name: p.name, slug: p.slug }); }
  }
  const extraProjectIds: string[] = [];
  for (const item of items) {
    if (item.project_id && !seenProjectIds[item.project_id]) {
      seenProjectIds[item.project_id] = true;
      extraProjectIds.push(item.project_id);
    }
  }
  if (extraProjectIds.length > 0) {
    const { data: extraProjects } = await supabase.from("projects").select("id, name, slug").in("id", extraProjectIds);
    for (const p of (extraProjects || []) as { id: string; name: string; slug: string }[]) allProjectsList.push(p);
  }
  allProjectsList.sort((a, b) => a.name.localeCompare(b.name));

  // Owner names
  const ownerIds = Array.from(new Set(items.map((i) => i.owner_id).filter(Boolean))) as string[];
  const ownerMap: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase.from("people").select("id, full_name").in("id", ownerIds);
    for (const o of (owners || []) as { id: string; full_name: string }[]) ownerMap[o.id] = o.full_name;
  }

  // Build project tabs with counts
  const projectCounts: Record<string, number> = {};
  for (const item of items) {
    const key = item.project_id || "__none__";
    projectCounts[key] = (projectCounts[key] || 0) + 1;
  }
  const projectTabs: { projectId: string | null; projectName: string; projectSlug: string | null; count: number }[] = [];
  for (const proj of allProjectsList) {
    projectTabs.push({
      projectId: proj.id,
      projectName: proj.name,
      projectSlug: proj.slug,
      count: projectCounts[proj.id] || 0,
    });
  }
  if (projectCounts["__none__"]) {
    projectTabs.push({ projectId: null, projectName: "No Project", projectSlug: null, count: projectCounts["__none__"] });
  }

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

      <VendorContacts initialContacts={people} vendorId={v.id} orgId={v.org_id} initialInvitations={(invitationData || []) as { id: string; email: string; accepted_at: string | null }[]} />

      <section>
        <VendorOpenItems items={items} ownerMap={ownerMap} projectTabs={projectTabs} />
      </section>
    </div>
  );
}

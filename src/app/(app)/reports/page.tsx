import { createClient } from "@/lib/supabase/server";
import SteeringReport from "@/components/steering-report";
import type { Project, Person, ProjectDepartmentStatus } from "@/lib/types";

export default async function ReportsPage() {
  const supabase = await createClient();

  const [
    { data: projects },
    { data: people },
    { data: deptStatuses },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("steering_priority", { ascending: true, nullsFirst: false })
      .order("name"),
    supabase.from("people").select("*").order("full_name"),
    supabase
      .from("project_department_statuses")
      .select("*, rep:people(*)")
      .order("sort_order"),
  ]);

  return (
    <div className="max-w-7xl mx-auto">
      <SteeringReport
        projects={(projects || []) as Project[]}
        people={(people || []) as Person[]}
        deptStatuses={(deptStatuses || []) as ProjectDepartmentStatus[]}
      />
    </div>
  );
}

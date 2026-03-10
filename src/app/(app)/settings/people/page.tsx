import { createClient } from "@/lib/supabase/server";
import PeopleList from "@/components/people-list";
import type { Person, Vendor } from "@/lib/types";

export default async function PeoplePage() {
  const supabase = await createClient();

  const [peopleRes, vendorsRes, profilesRes] = await Promise.all([
    supabase
      .from("people")
      .select("*, vendor:vendors(*)")
      .order("is_internal", { ascending: false })
      .order("full_name"),
    supabase.from("vendors").select("id, name").order("name"),
    supabase.from("profiles").select("id, role, vendor_id, full_name"),
  ]);

  const people = (peopleRes.data || []) as (Person & { vendor: Vendor | null })[];
  const vendors = (vendorsRes.data || []) as Vendor[];
  const profiles = profilesRes.data || [];

  return (
    <PeopleList
      initialPeople={people}
      vendors={vendors}
      profiles={profiles}
    />
  );
}

-- Enable RLS on junction tables that were missing it
-- Supabase security advisor flagged these as publicly accessible

-- project_vendors
ALTER TABLE project_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project_vendors in their org"
  ON project_vendors FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = project_vendors.project_id
      AND projects.org_id = public.user_org_id()
  ));

CREATE POLICY "Admins can manage project_vendors"
  ON project_vendors FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = project_vendors.project_id
      AND projects.org_id = public.user_org_id()
  ) AND public.user_role() IN ('super_admin', 'admin'));

-- meeting_projects
ALTER TABLE meeting_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting_projects in their org"
  ON meeting_projects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings WHERE meetings.id = meeting_projects.meeting_id
      AND meetings.org_id = public.user_org_id()
  ));

CREATE POLICY "Admins can manage meeting_projects"
  ON meeting_projects FOR ALL
  USING (EXISTS (
    SELECT 1 FROM meetings WHERE meetings.id = meeting_projects.meeting_id
      AND meetings.org_id = public.user_org_id()
  ) AND public.user_role() IN ('super_admin', 'admin'));

-- meeting_attendees
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting_attendees in their org"
  ON meeting_attendees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM meetings WHERE meetings.id = meeting_attendees.meeting_id
      AND meetings.org_id = public.user_org_id()
  ));

CREATE POLICY "Admins can manage meeting_attendees"
  ON meeting_attendees FOR ALL
  USING (EXISTS (
    SELECT 1 FROM meetings WHERE meetings.id = meeting_attendees.meeting_id
      AND meetings.org_id = public.user_org_id()
  ) AND public.user_role() IN ('super_admin', 'admin'));

-- intake_entities
ALTER TABLE intake_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view intake_entities in their org"
  ON intake_entities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM intakes WHERE intakes.id = intake_entities.intake_id
      AND intakes.org_id = public.user_org_id()
  ));

CREATE POLICY "Users can manage intake_entities in their org"
  ON intake_entities FOR ALL
  USING (EXISTS (
    SELECT 1 FROM intakes WHERE intakes.id = intake_entities.intake_id
      AND intakes.org_id = public.user_org_id()
  ));

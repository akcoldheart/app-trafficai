-- Allow team members to access their team owner's data via RLS
-- This fixes the issue where effectiveUserId resolves to the owner,
-- but auth.uid() is the team member, causing RLS to block queries.

-- Helper function: returns the team owner's user_id if the current user is a team member
CREATE OR REPLACE FUNCTION get_team_owner_id()
RETURNS UUID AS $$
  SELECT t.owner_user_id
  FROM teams t
  JOIN team_members tm ON tm.team_id = t.id
  WHERE tm.user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PIXELS: team members can view/manage owner's pixels
CREATE POLICY "Team members can access owner pixels" ON pixels
  FOR ALL USING (user_id = get_team_owner_id());

-- VISITORS: team members can view/manage owner's visitors
CREATE POLICY "Team members can access owner visitors" ON visitors
  FOR ALL USING (user_id = get_team_owner_id());

-- PIXEL_EVENTS: team members can view events for owner's pixels
CREATE POLICY "Team members can view owner pixel events" ON pixel_events
  FOR SELECT USING (
    pixel_id IN (
      SELECT id FROM pixels WHERE user_id = get_team_owner_id()
    )
  );

-- INTEGRATIONS: team members can access owner's integrations
CREATE POLICY "Team members can access owner integrations" ON integrations
  FOR ALL USING (user_id = get_team_owner_id());

-- USER_WEBSITES: team members can access owner's websites
CREATE POLICY "Team members can access owner websites" ON user_websites
  FOR ALL USING (user_id = get_team_owner_id());

-- AUDIENCE_REQUESTS: team members can view owner's audience requests
CREATE POLICY "Team members can access owner audience requests" ON audience_requests
  FOR ALL USING (user_id = get_team_owner_id());

-- AUDIENCE_ASSIGNMENTS: team members can view owner's audience assignments
CREATE POLICY "Team members can access owner audience assignments" ON audience_assignments
  FOR ALL USING (user_id = get_team_owner_id());

-- AUDIT_LOGS: team members can view their own audit logs (already covered by existing policy)
-- No change needed

-- USER_API_KEYS: team members can view owner's API key
CREATE POLICY "Team members can view owner api keys" ON user_api_keys
  FOR SELECT USING (user_id = get_team_owner_id());

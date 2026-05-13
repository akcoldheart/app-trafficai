-- Migration: 068_platform_integrations_team_rls
-- Description: Add team-member SELECT policy on platform_integrations.
--   Migration 063 added team-member RLS bridges for pixels, visitors, integrations,
--   user_websites, audience_requests, audience_assignments, and user_api_keys —
--   but missed platform_integrations. This patches that gap so team members can
--   read their team owner's integration status via the anon client if needed.
-- Date: 2026-05-13
--
-- Trade-off note: Only SELECT is exposed to team members. INSERT/UPDATE/DELETE
-- via the anon client remain owner-only. All mutations from API routes already
-- go through the service-role client (RLS bypassed), so this does not affect
-- the intentional "all team members can mutate integrations" behavior chosen
-- at the application layer.

-- Defensive: idempotent drop in case of re-run
DROP POLICY IF EXISTS "Team members can view owner platform integrations" ON platform_integrations;

CREATE POLICY "Team members can view owner platform integrations"
  ON platform_integrations FOR SELECT
  USING (user_id = get_team_owner_id());

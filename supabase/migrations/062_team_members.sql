-- Team Members Feature
-- Allows users to invite team members who share the same workspace (pixels, visitors, audiences, integrations)

-- Teams table: each paying user can own one team
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Team',
  max_seats INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_owner ON teams(owner_user_id);

-- Team members: users who belong to a team (owner is NOT in this table)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user can only be a member of one team at a time
CREATE UNIQUE INDEX idx_team_members_user ON team_members(user_id);
CREATE UNIQUE INDEX idx_team_members_team_user ON team_members(team_id, user_id);

-- RLS policies (service role bypasses these, but good to have as fallback)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Teams: owner can see/manage their team
CREATE POLICY "Team owner full access" ON teams
  FOR ALL USING (owner_user_id = auth.uid());

-- Team members: can see their own membership
CREATE POLICY "Members can view own membership" ON team_members
  FOR SELECT USING (user_id = auth.uid());

-- Team members: owner can manage members
CREATE POLICY "Team owner can manage members" ON team_members
  FOR ALL USING (
    team_id IN (SELECT id FROM teams WHERE owner_user_id = auth.uid())
  );

-- Seed team seat limits into app_settings
INSERT INTO app_settings (key, value, description) VALUES
  ('team_seats_starter', '2', 'Max team members for Starter plan'),
  ('team_seats_growth', '5', 'Max team members for Growth plan'),
  ('team_seats_professional', '10', 'Max team members for Professional plan'),
  ('team_seats_enterprise', '25', 'Max team members for Enterprise plan')
ON CONFLICT (key) DO NOTHING;

-- Auto-create teams for existing paying users
INSERT INTO teams (owner_user_id, name, max_seats)
SELECT u.id, COALESCE(u.company, u.full_name || '''s Team', u.email || '''s Team'),
  CASE u.plan
    WHEN 'starter' THEN 2
    WHEN 'growth' THEN 5
    WHEN 'professional' THEN 10
    WHEN 'enterprise' THEN 25
    ELSE 2
  END
FROM users u
WHERE u.plan IS NOT NULL
ON CONFLICT (owner_user_id) DO NOTHING;

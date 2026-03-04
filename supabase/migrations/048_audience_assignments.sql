-- Multi-user audience assignments
CREATE TABLE IF NOT EXISTS audience_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(audience_id, user_id)
);

-- Index for fast lookups by audience
CREATE INDEX idx_audience_assignments_audience_id ON audience_assignments(audience_id);

-- Index for fast lookups by user
CREATE INDEX idx_audience_assignments_user_id ON audience_assignments(user_id);

-- RLS
ALTER TABLE audience_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "admins_all_audience_assignments" ON audience_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- Users can see their own assignments
CREATE POLICY "users_read_own_assignments" ON audience_assignments
  FOR SELECT USING (user_id = auth.uid());

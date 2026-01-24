-- Request Workflow Migration
-- Creates tables for pixel requests, audience requests, and admin notifications

-- Create pixel_requests table
CREATE TABLE IF NOT EXISTS public.pixel_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  pixel_id UUID REFERENCES public.pixels(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audience_requests table
CREATE TABLE IF NOT EXISTS public.audience_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('standard', 'custom')),
  name TEXT NOT NULL,
  form_data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  audience_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create admin_notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pixel_requests_user ON pixel_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pixel_requests_status ON pixel_requests(status);
CREATE INDEX IF NOT EXISTS idx_pixel_requests_created ON pixel_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audience_requests_user ON audience_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_audience_requests_status ON audience_requests(status);
CREATE INDEX IF NOT EXISTS idx_audience_requests_created ON audience_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(type);

-- Enable Row Level Security
ALTER TABLE pixel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audience_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pixel_requests
-- Users can view their own requests, admins can view all
CREATE POLICY "pixel_requests_select" ON pixel_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Users can insert their own requests
CREATE POLICY "pixel_requests_insert" ON pixel_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own pending requests, admins can update any
CREATE POLICY "pixel_requests_update" ON pixel_requests
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Users can delete their own pending requests, admins can delete any
CREATE POLICY "pixel_requests_delete" ON pixel_requests
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for audience_requests
-- Users can view their own requests, admins can view all
CREATE POLICY "audience_requests_select" ON audience_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Users can insert their own requests
CREATE POLICY "audience_requests_insert" ON audience_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own pending requests, admins can update any
CREATE POLICY "audience_requests_update" ON audience_requests
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Users can delete their own pending requests, admins can delete any
CREATE POLICY "audience_requests_delete" ON audience_requests
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- RLS Policies for admin_notifications
-- Only admins can view notifications
CREATE POLICY "admin_notifications_select" ON admin_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- System can insert (will be done via service role)
CREATE POLICY "admin_notifications_insert" ON admin_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins can update (mark as read)
CREATE POLICY "admin_notifications_update" ON admin_notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "admin_notifications_delete" ON admin_notifications
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_pixel_requests_updated_at ON pixel_requests;
CREATE TRIGGER update_pixel_requests_updated_at
  BEFORE UPDATE ON pixel_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audience_requests_updated_at ON audience_requests;
CREATE TRIGGER update_audience_requests_updated_at
  BEFORE UPDATE ON audience_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

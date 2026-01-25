-- Fix Admin Notifications RLS Policies
-- Updates RLS policies to check the role column directly instead of joining with roles table

-- Drop existing policies
DROP POLICY IF EXISTS "admin_notifications_select" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_insert" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_update" ON admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_delete" ON admin_notifications;

-- Recreate policies using direct role column check
-- Only admins can view notifications
CREATE POLICY "admin_notifications_select" ON admin_notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Anyone can insert notifications (for request submissions)
CREATE POLICY "admin_notifications_insert" ON admin_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins can update (mark as read)
CREATE POLICY "admin_notifications_update" ON admin_notifications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Only admins can delete
CREATE POLICY "admin_notifications_delete" ON admin_notifications
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- Also fix pixel_requests and audience_requests policies to use direct role check
-- This ensures consistency across all request-related tables

-- Drop existing pixel_requests policies
DROP POLICY IF EXISTS "pixel_requests_select" ON pixel_requests;
DROP POLICY IF EXISTS "pixel_requests_insert" ON pixel_requests;
DROP POLICY IF EXISTS "pixel_requests_update" ON pixel_requests;
DROP POLICY IF EXISTS "pixel_requests_delete" ON pixel_requests;

-- Recreate pixel_requests policies with direct role check
CREATE POLICY "pixel_requests_select" ON pixel_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "pixel_requests_insert" ON pixel_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "pixel_requests_update" ON pixel_requests
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "pixel_requests_delete" ON pixel_requests
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Drop existing audience_requests policies
DROP POLICY IF EXISTS "audience_requests_select" ON audience_requests;
DROP POLICY IF EXISTS "audience_requests_insert" ON audience_requests;
DROP POLICY IF EXISTS "audience_requests_update" ON audience_requests;
DROP POLICY IF EXISTS "audience_requests_delete" ON audience_requests;

-- Recreate audience_requests policies with direct role check
CREATE POLICY "audience_requests_select" ON audience_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "audience_requests_insert" ON audience_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "audience_requests_update" ON audience_requests
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "audience_requests_delete" ON audience_requests
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending') OR
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

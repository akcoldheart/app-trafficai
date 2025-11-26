-- Fix infinite recursion in RLS policies
-- Run this in your Supabase SQL Editor

-- First, let's drop the problematic policies on pixels and integrations
DROP POLICY IF EXISTS "Admins can view all pixels" ON public.pixels;
DROP POLICY IF EXISTS "Admins can view all integrations" ON public.integrations;

-- Create a security definer function to check admin status without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Recreate admin policies using the function
CREATE POLICY "Admins can view all pixels"
  ON public.pixels FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can view all integrations"
  ON public.integrations FOR SELECT
  USING (public.is_admin());

-- Also fix the original users table policies if they have the same issue
-- Drop existing admin policies
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update users" ON public.users;

-- Recreate using the security definer function
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update users"
  ON public.users FOR UPDATE
  USING (public.is_admin());

-- Also fix user_api_keys policies
DROP POLICY IF EXISTS "Admins can view all API keys" ON public.user_api_keys;
DROP POLICY IF EXISTS "Admins can manage API keys" ON public.user_api_keys;

CREATE POLICY "Admins can view all API keys"
  ON public.user_api_keys FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can manage API keys"
  ON public.user_api_keys FOR ALL
  USING (public.is_admin());

-- Also fix audit_logs policies
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin());

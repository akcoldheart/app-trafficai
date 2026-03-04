-- Enable RLS on audience_contacts table
-- All existing code uses the service_role client which bypasses RLS,
-- so this is purely a safety net against direct PostgREST access.

ALTER TABLE public.audience_contacts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (already bypasses RLS, but explicit for clarity)
CREATE POLICY "Service role full access"
  ON public.audience_contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read contacts belonging to their own audiences
-- Ownership is verified by joining through audience_requests.user_id
CREATE POLICY "Users can view own audience contacts"
  ON public.audience_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audience_requests ar
      WHERE ar.id::text = audience_contacts.audience_id
        AND ar.user_id = auth.uid()
    )
  );

-- Only service_role can insert/update/delete (admins use service_role client)
-- No INSERT/UPDATE/DELETE policies for authenticated role = denied by default

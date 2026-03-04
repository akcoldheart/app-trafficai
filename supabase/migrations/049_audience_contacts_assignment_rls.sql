-- Allow users to view contacts for audiences assigned to them via audience_assignments
CREATE POLICY "Assigned users can view audience contacts"
  ON public.audience_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audience_assignments aa
      WHERE aa.audience_id = audience_contacts.audience_id
        AND aa.user_id = auth.uid()
    )
  );

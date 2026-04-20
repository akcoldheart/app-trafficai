-- Composite index to support keyset pagination for audience export.
-- Without this, ordering by id within an audience_id filter requires
-- an in-memory sort of every contact per batch — which times out on
-- large audiences (100k+ contacts).
CREATE INDEX IF NOT EXISTS idx_audience_contacts_audience_id_id
  ON audience_contacts (audience_id, id);

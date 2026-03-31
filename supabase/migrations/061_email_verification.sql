-- Add email verification columns to visitors table (ZeroBounce integration)
ALTER TABLE visitors
  ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_sub_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering verified emails in sync operations
CREATE INDEX IF NOT EXISTS idx_visitors_email_status ON visitors(email_status) WHERE email_status IS NOT NULL;

COMMENT ON COLUMN visitors.email_status IS 'ZeroBounce status: valid, invalid, catch-all, spamtrap, abuse, do_not_mail, unknown';
COMMENT ON COLUMN visitors.email_sub_status IS 'ZeroBounce sub-status: e.g. alias_address, role_based, disposable, etc.';
COMMENT ON COLUMN visitors.email_verified_at IS 'Timestamp when email was last verified via ZeroBounce';

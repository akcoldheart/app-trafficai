-- Add trial period fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS trial_notified BOOLEAN DEFAULT FALSE;

-- Set default trial period for new users (7 days)
-- Update the handle_new_user function to set trial_ends_at
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, plan, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    'team',
    'free',
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set trial for existing free users who don't have a trial_ends_at set
-- (Use their created_at + 7 days, or if that's in the past, give them 7 more days)
UPDATE users
SET trial_ends_at = GREATEST(created_at + INTERVAL '7 days', NOW() + INTERVAL '7 days')
WHERE plan = 'free' OR plan IS NULL
AND trial_ends_at IS NULL;

-- Create index for trial queries
CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users(trial_ends_at);

-- Comment on columns
COMMENT ON COLUMN users.trial_ends_at IS 'When the free trial period ends';
COMMENT ON COLUMN users.trial_notified IS 'Whether user has been notified about trial expiration';

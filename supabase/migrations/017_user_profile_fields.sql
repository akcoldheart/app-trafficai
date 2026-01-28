-- Add profile fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS company TEXT,
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter';

-- Comment on columns
COMMENT ON COLUMN users.full_name IS 'User full name';
COMMENT ON COLUMN users.phone IS 'User phone number';
COMMENT ON COLUMN users.company IS 'User company name';
COMMENT ON COLUMN users.plan IS 'User subscription plan';

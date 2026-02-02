-- Rename 'free' plan to 'trial' plan
-- This migration updates the plan naming to be more accurate

-- Update existing users from 'free' to 'trial'
UPDATE users
SET plan = 'trial'
WHERE plan = 'free';

-- Update the handle_new_user function to use 'trial' plan with correct 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  company_website_val TEXT;
  user_role_id UUID;
BEGIN
  -- Get the company website from user metadata
  company_website_val := NEW.raw_user_meta_data->>'company_website';

  -- Get the 'user' role ID
  SELECT id INTO user_role_id FROM public.roles WHERE name = 'user';

  -- Insert the new user with 'user' role, role_id, trial plan, and trial period
  INSERT INTO public.users (id, email, role, role_id, company_website, plan, trial_ends_at)
  VALUES (NEW.id, NEW.email, 'user', user_role_id, company_website_val, 'trial', NOW() + INTERVAL '7 days');

  -- Create user_website entry if company website was provided
  IF company_website_val IS NOT NULL AND company_website_val != '' THEN
    INSERT INTO public.user_websites (user_id, url, name, is_primary)
    VALUES (NEW.id, company_website_val, 'Primary Website', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update column default if it exists
ALTER TABLE users
ALTER COLUMN plan SET DEFAULT 'trial';

-- Update comment
COMMENT ON COLUMN users.plan IS 'User subscription plan: trial (7-day, 250 visitors), starter, growth, professional, enterprise';

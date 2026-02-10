-- Add onboarding_completed field to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Mark all existing users as onboarding completed (only new signups see the tour)
UPDATE users SET onboarding_completed = TRUE WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;

-- Update the handle_new_user function to include onboarding_completed
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

  -- Insert the new user with 'user' role, role_id, trial plan, trial period, and onboarding not completed
  INSERT INTO public.users (id, email, role, role_id, company_website, plan, trial_ends_at, onboarding_completed)
  VALUES (NEW.id, NEW.email, 'user', user_role_id, company_website_val, 'trial', NOW() + INTERVAL '7 days', FALSE);

  -- Create user_website entry if company website was provided
  IF company_website_val IS NOT NULL AND company_website_val != '' THEN
    INSERT INTO public.user_websites (user_id, url, name, is_primary)
    VALUES (NEW.id, company_website_val, 'Primary Website', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

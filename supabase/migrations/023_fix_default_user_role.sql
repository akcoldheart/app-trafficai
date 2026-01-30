-- Migration: Fix default role for new users
-- Changes default from 'partner' to 'user' and ensures proper role_id assignment

-- Update the default value on the users table
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user';

-- Update the trigger function to use 'user' as default role and also assign role_id
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

  -- Insert the new user with 'user' role and role_id
  INSERT INTO public.users (id, email, role, role_id, company_website)
  VALUES (NEW.id, NEW.email, 'user', user_role_id, company_website_val);

  -- Create user_website entry if company website was provided
  IF company_website_val IS NOT NULL AND company_website_val != '' THEN
    INSERT INTO public.user_websites (user_id, url, name, is_primary)
    VALUES (NEW.id, company_website_val, 'Primary Website', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate any existing users with 'partner' role to 'user' role
-- (in case migration 010 didn't run or new partner users were created)
UPDATE public.users
SET role = 'user',
    role_id = (SELECT id FROM public.roles WHERE name = 'user')
WHERE role = 'partner';

-- Also fix any users who have role='user' but no role_id
UPDATE public.users
SET role_id = (SELECT id FROM public.roles WHERE name = 'user')
WHERE role = 'user' AND role_id IS NULL;

-- Ensure 'user' role has access to visitors page
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id FROM roles r, menu_items m
WHERE r.name = 'user' AND m.href = '/visitors'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Migration: Change default role from 'team' to 'partner' for new signups

-- Update the default value on the users table
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'partner';

-- Update the trigger function to use 'partner' as default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'partner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger doesn't need to be recreated since we're just updating the function

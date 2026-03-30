-- Migration: 060_referral_attribution_trigger
-- Description: Update handle_new_user trigger to automatically attribute referrals from user metadata
-- Date: 2026-03-30

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  company_website_val TEXT;
  user_role_id UUID;
  ref_code_val TEXT;
  referral_code_row RECORD;
  attribution_expires TIMESTAMPTZ;
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

  -- Referral attribution: if ref_code is in user metadata, create referral record
  ref_code_val := NEW.raw_user_meta_data->>'ref_code';
  IF ref_code_val IS NOT NULL AND ref_code_val != '' THEN
    SELECT id, user_id, commission_rate, cookie_duration_days
    INTO referral_code_row
    FROM public.referral_codes
    WHERE LOWER(code) = LOWER(ref_code_val)
      AND is_active = true
    LIMIT 1;

    IF referral_code_row.id IS NOT NULL AND referral_code_row.user_id != NEW.id THEN
      attribution_expires := NOW() + (COALESCE(referral_code_row.cookie_duration_days, 30) || ' days')::INTERVAL;

      INSERT INTO public.referrals (
        referrer_user_id, referred_user_id, referral_code_id,
        status, referred_email, signed_up_at,
        commission_rate, attribution_expires_at
      ) VALUES (
        referral_code_row.user_id, NEW.id, referral_code_row.id,
        'signed_up', NEW.email, NOW(),
        referral_code_row.commission_rate, attribution_expires
      )
      ON CONFLICT (referred_user_id) WHERE referred_user_id IS NOT NULL DO NOTHING;

      -- Update users.referred_by
      UPDATE public.users SET referred_by = referral_code_row.user_id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

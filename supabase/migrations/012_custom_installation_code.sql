-- Add custom installation code column to pixels table
ALTER TABLE public.pixels ADD COLUMN IF NOT EXISTS custom_installation_code TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.pixels.custom_installation_code IS 'Optional custom installation code that overrides the auto-generated code';

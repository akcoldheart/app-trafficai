-- Add connection message template to LinkedIn campaigns
ALTER TABLE linkedin_campaigns ADD COLUMN IF NOT EXISTS connection_message text;


-- Add company and job_title to linkedin_campaign_contacts for message personalization
ALTER TABLE linkedin_campaign_contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE linkedin_campaign_contacts ADD COLUMN IF NOT EXISTS job_title text;

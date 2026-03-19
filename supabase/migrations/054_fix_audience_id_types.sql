-- Fix audience_id columns to text (audience IDs from external APIs may not be UUIDs)
ALTER TABLE linkedin_campaigns ALTER COLUMN audience_id TYPE text;
ALTER TABLE facebook_audience_imports ALTER COLUMN source_audience_id TYPE text;

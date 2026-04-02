-- Remove team invitations table and related email settings (replaced by direct member creation)
DROP TABLE IF EXISTS team_invitations;

DELETE FROM app_settings WHERE key IN ('resend_api_key', 'email_from_address');

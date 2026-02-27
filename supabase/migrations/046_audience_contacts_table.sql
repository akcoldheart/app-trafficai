-- Create audience_contacts table for storing individual contact records
-- instead of a JSON blob in audience_requests.form_data
CREATE TABLE audience_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id TEXT NOT NULL,
  email TEXT,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  job_title TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  linkedin_url TEXT,
  seniority TEXT,
  department TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audience_contacts_audience_id ON audience_contacts(audience_id);
CREATE INDEX idx_audience_contacts_email ON audience_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX idx_audience_contacts_full_name ON audience_contacts(full_name) WHERE full_name IS NOT NULL;

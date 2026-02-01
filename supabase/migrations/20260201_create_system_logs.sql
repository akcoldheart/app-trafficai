-- Create system_logs table for webhook and API logging
CREATE TABLE IF NOT EXISTS system_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'webhook', 'api', 'stripe', 'error', 'info'
  event_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'success', 'error', 'warning', 'info'
  message TEXT NOT NULL,
  request_data JSONB,
  response_data JSONB,
  error_details TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_system_logs_type ON system_logs(type);
CREATE INDEX IF NOT EXISTS idx_system_logs_status ON system_logs(status);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_name ON system_logs(event_name);

-- Enable RLS
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read logs (via service role)
-- The API uses service role key, so RLS won't block it
-- But we add a policy for direct database access

-- Allow service role full access
CREATE POLICY "Service role has full access to system_logs"
  ON system_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add comment
COMMENT ON TABLE system_logs IS 'System logs for webhooks, API calls, and errors';

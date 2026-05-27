ALTER TABLE demo_submissions ADD COLUMN upload_key TEXT;
ALTER TABLE demo_submissions ADD COLUMN upload_name TEXT;
ALTER TABLE demo_submissions ADD COLUMN upload_type TEXT;
ALTER TABLE demo_submissions ADD COLUMN upload_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_demo_submissions_status_updated_at ON demo_submissions (status, updated_at DESC);

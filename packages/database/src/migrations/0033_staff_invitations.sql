-- Existing staff/service users keep their current authentication behavior.
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_provisioning jsonb;

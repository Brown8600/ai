DO $$ BEGIN
  CREATE TYPE admin_role AS ENUM ('SUPER_ADMIN', 'OPERATOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role admin_role NOT NULL DEFAULT 'OPERATOR',
  enabled boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username = lower(username))
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id bigserial PRIMARY KEY,
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx ON admin_audit_logs(admin_user_id, created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_carrier text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no text;
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at DESC);

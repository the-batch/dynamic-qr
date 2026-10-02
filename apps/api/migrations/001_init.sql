CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  short_code VARCHAR(32) NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country VARCHAR(100),
  city VARCHAR(100),
  ip_hash VARCHAR(64),
  user_agent TEXT,
  device_type VARCHAR(50),
  browser VARCHAR(50),
  os VARCHAR(50),
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS scans_qr_code_scanned_at_idx
  ON scans (qr_code_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS scans_scanned_at_idx ON scans (scanned_at DESC);
-- Migration: 20260701_add_kyc_manual_override
-- Description: Add manual override status fields to compliance tables so that
--              admin users can override automated KYC decisions after review.
--              Tracks who performed the override, when, and the reason —
--              creating a complete audit trail for compliance reporting.
-- Issue: #1574

-- ─── kyc_applicants ─────────────────────────────────────────────────────────
ALTER TABLE kyc_applicants
  ADD COLUMN IF NOT EXISTS is_manual_override      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_status  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS manual_override_reason  TEXT,
  ADD COLUMN IF NOT EXISTS manual_override_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_override_at      TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_kyc_applicants_manual_override
  ON kyc_applicants(is_manual_override);

-- ─── kyc_tier_upgrade_requests ──────────────────────────────────────────────
ALTER TABLE kyc_tier_upgrade_requests
  ADD COLUMN IF NOT EXISTS is_manual_override      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_reason  TEXT,
  ADD COLUMN IF NOT EXISTS manual_override_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_override_at      TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_kyc_tier_upgrade_manual_override
  ON kyc_tier_upgrade_requests(is_manual_override);

-- Down migration
-- ALTER TABLE kyc_applicants
--   DROP COLUMN IF EXISTS is_manual_override,
--   DROP COLUMN IF EXISTS manual_override_status,
--   DROP COLUMN IF EXISTS manual_override_reason,
--   DROP COLUMN IF EXISTS manual_override_by,
--   DROP COLUMN IF EXISTS manual_override_at;
-- ALTER TABLE kyc_tier_upgrade_requests
--   DROP COLUMN IF EXISTS is_manual_override,
--   DROP COLUMN IF EXISTS manual_override_reason,
--   DROP COLUMN IF EXISTS manual_override_by,
--   DROP COLUMN IF EXISTS manual_override_at;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacy_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consent_ip"          TEXT,
  ADD COLUMN IF NOT EXISTS "consent_doc_version" TEXT;

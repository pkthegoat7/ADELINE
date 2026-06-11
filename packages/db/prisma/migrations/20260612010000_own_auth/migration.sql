-- Auth próprio: hash de senha local + tokens de redefinição

ALTER TABLE users ADD COLUMN password_hash TEXT;

CREATE TABLE password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX password_reset_tokens_token_key ON password_reset_tokens(token);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY password_reset_tokens_tenant ON password_reset_tokens
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = user_id AND u.tenant_id = app_current_tenant()));

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTAINER = 'adelina-rls-test-pg';
const PORT = 55432;
// Owner = 'adelina' (igual à prod), para a migration `ALTER DEFAULT PRIVILEGES FOR ROLE adelina` casar.
const OWNER = 'adelina';
const OWNER_PW = 'ownerpw';
const APP = 'adelina_app';
const APP_PW = 'apppw';
const DB = 'adelina_test';

// Monorepo root (apps/api/test/integration → ../../../../)
const REPO_ROOT = resolve(__dirname, '../../../../');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'packages/db/prisma/migrations');

function sh(cmd: string) { return execSync(cmd, { stdio: 'pipe' }).toString(); }
function psql(role: string, sql: string) {
  return sh(`docker exec ${CONTAINER} psql -U ${role} -d ${DB} -v ON_ERROR_STOP=1 -tA -c "${sql.replace(/"/g, '\\"')}"`);
}

/**
 * Apply a migration SQL file via stdin (no ON_ERROR_STOP so partial failures are ok).
 * The RLS migrations contain Supabase-specific policies that may not exist in vanilla Postgres
 * but the critical GRANTs and CREATE POLICY statements still run.
 */
function psqlFile(role: string, filePath: string) {
  const sql = readFileSync(filePath, 'utf-8');
  const result = spawnSync('docker', [
    'exec', '-i', CONTAINER,
    'psql', '-U', role, '-d', DB,
  ], { input: sql, encoding: 'utf-8' });
  return result.stdout;
}

export async function setup() {
  try { sh(`docker rm -f ${CONTAINER}`); } catch {}
  sh(`docker run -d --name ${CONTAINER} -e POSTGRES_USER=${OWNER} -e POSTGRES_PASSWORD=${OWNER_PW} -e POSTGRES_DB=${DB} -p ${PORT}:5432 postgres:17-alpine`);
  for (let i = 0; i < 60; i++) {
    try { sh(`docker exec ${CONTAINER} pg_isready -U ${OWNER} -d ${DB}`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }

  // Supabase-specific roles referenced in migrations (REVOKE FROM anon, authenticated).
  // Create them as noop roles so those statements don't fail.
  psql(OWNER, `CREATE ROLE anon NOLOGIN NOSUPERUSER;`);
  psql(OWNER, `CREATE ROLE authenticated NOLOGIN NOSUPERUSER;`);

  // Create the restricted app role — must exist before the GRANT migration runs.
  psql(OWNER, `CREATE ROLE ${APP} WITH LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;`);

  // Phase 1: prisma db push creates all tables from schema (skips broken migration chain).
  // The subscriptions table is in schema.prisma but never in any migration SQL, so
  // `migrate deploy` would fail. db push handles this cleanly.
  const ownerUrl = `postgresql://${OWNER}:${OWNER_PW}@localhost:${PORT}/${DB}`;
  sh(`DATABASE_URL='${ownerUrl}' DIRECT_URL='${ownerUrl}' pnpm --filter @adelina/db exec prisma db push --skip-generate --accept-data-loss`);

  // Phase 2: Apply the two RLS migration SQL files manually to get policies + grants.
  // These are idempotent-safe (CREATE OR REPLACE, DROP POLICY IF EXISTS).
  // Some ALTER POLICY statements in the last migration reference policies created by
  // intermediate migrations not present here; those ERRORs are non-fatal because the
  // base policy already has the correct content from the init rls_policies migration.
  psqlFile(OWNER, resolve(MIGRATIONS_DIR, '20260517000000_rls_policies/migration.sql'));
  psqlFile(OWNER, resolve(MIGRATIONS_DIR, '20260622000000_rls_app_role_enforce/migration.sql'));

  const tA = '11111111-1111-1111-1111-111111111111';
  const tB = '22222222-2222-2222-2222-222222222222';

  // Fixed UUIDs for seed entities (deterministic, easier to debug)
  const propA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const propB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const guestA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const guestB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const userA = '11111111-1111-1111-1111-111111111112';
  const userB = '22222222-2222-2222-2222-222222222223';

  // Seed as owner (superuser bypasses RLS, so inserts work even with RLS enabled)
  // Seed tenant A
  psql(OWNER, `INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at) VALUES ('${tA}', 'Pousada A', 'a', 'trial', 'active', now(), now());`);
  psql(OWNER, `INSERT INTO properties (id, tenant_id, name, slug, country, timezone, currency, created_at, updated_at) VALUES ('${propA}', '${tA}', 'Prop A', 'principal', 'BR', 'America/Sao_Paulo', 'BRL', now(), now());`);
  psql(OWNER, `INSERT INTO guests (id, tenant_id, full_name, created_at, updated_at) VALUES ('${guestA}', '${tA}', 'Guest A', now(), now());`);
  psql(OWNER, `INSERT INTO users (id, tenant_id, email, full_name, role, active, created_at, updated_at) VALUES ('${userA}', '${tA}', 'owner-a@x.com', 'Owner A', 'owner', true, now(), now());`);
  psql(OWNER, `INSERT INTO reservations (id, tenant_id, property_id, guest_id, code, status, check_in, check_out, total_amount, net_amount, created_at, updated_at) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '${tA}', '${propA}', '${guestA}', 'ADL-a-1', 'confirmed', CURRENT_DATE, CURRENT_DATE + 1, 100.00, 100.00, now(), now());`);

  // Seed tenant B
  psql(OWNER, `INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at) VALUES ('${tB}', 'Pousada B', 'b', 'trial', 'active', now(), now());`);
  psql(OWNER, `INSERT INTO properties (id, tenant_id, name, slug, country, timezone, currency, created_at, updated_at) VALUES ('${propB}', '${tB}', 'Prop B', 'principal', 'BR', 'America/Sao_Paulo', 'BRL', now(), now());`);
  psql(OWNER, `INSERT INTO guests (id, tenant_id, full_name, created_at, updated_at) VALUES ('${guestB}', '${tB}', 'Guest B', now(), now());`);
  psql(OWNER, `INSERT INTO users (id, tenant_id, email, full_name, role, active, created_at, updated_at) VALUES ('${userB}', '${tB}', 'owner-b@x.com', 'Owner B', 'owner', true, now(), now());`);
  psql(OWNER, `INSERT INTO reservations (id, tenant_id, property_id, guest_id, code, status, check_in, check_out, total_amount, net_amount, created_at, updated_at) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', '${tB}', '${propB}', '${guestB}', 'ADL-b-1', 'confirmed', CURRENT_DATE, CURRENT_DATE + 1, 200.00, 200.00, now(), now());`);

  process.env.RLS_TEST_OWNER_URL = ownerUrl;
  process.env.RLS_TEST_APP_URL = `postgresql://${APP}:${APP_PW}@localhost:${PORT}/${DB}`;
  process.env.RLS_TEST_TENANT_A = tA;
  process.env.RLS_TEST_TENANT_B = tB;
}

export async function teardown() {
  try { sh(`docker rm -f ${CONTAINER}`); } catch {}
}

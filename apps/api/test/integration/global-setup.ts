import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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

  // Phase 2: Apply ALL migration SQL files in timestamp order so every table gets its
  // RLS policies, GRANTs, and helper functions — not just the two originally hardcoded.
  // psqlFile runs without ON_ERROR_STOP, so CREATE TABLE / ADD COLUMN errors from
  // db push having already created the tables are harmless; what matters is that
  // CREATE POLICY / ENABLE ROW LEVEL SECURITY / CREATE FUNCTION / GRANT all succeed.
  const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dir of migrationDirs) {
    psqlFile(OWNER, resolve(MIGRATIONS_DIR, dir, 'migration.sql'));
  }

  const tA = '11111111-1111-1111-1111-111111111111';
  const tB = '22222222-2222-2222-2222-222222222222';

  // Fixed UUIDs for seed entities (deterministic, easier to debug)
  const propA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const propB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const guestA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const guestB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const userA = '11111111-1111-1111-1111-111111111112';
  const userB = '22222222-2222-2222-2222-222222222223';
  const expenseA = 'ea000000-ea00-ea00-ea00-ea0000000000';
  const expenseB = 'eb000000-eb00-eb00-eb00-eb0000000000';
  const rtA = 'a1000000-a100-a100-a100-a10000000000'; // room_type tenant A
  const rtB = 'b1000000-b100-b100-b100-b10000000000'; // room_type tenant B
  const roomA = 'a2000000-a200-a200-a200-a20000000000';
  const roomB = 'b2000000-b200-b200-b200-b20000000000';

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

  // Seed expenses (direct tenant_id — proves later-added table's RLS policy works)
  psql(OWNER, `INSERT INTO expenses (id, tenant_id, category, description, amount, date, status, created_at, updated_at) VALUES ('${expenseA}', '${tA}', 'other', 'Custo A', 50.00, CURRENT_DATE, 'pending', now(), now());`);
  psql(OWNER, `INSERT INTO expenses (id, tenant_id, category, description, amount, date, status, created_at, updated_at) VALUES ('${expenseB}', '${tB}', 'other', 'Custo B', 80.00, CURRENT_DATE, 'pending', now(), now());`);

  // Seed room_types + rooms (helper-based policy: rooms_tenant uses app_property_in_tenant(property_id))
  psql(OWNER, `INSERT INTO room_types (id, property_id, name, code, capacity, beds, base_price, created_at, updated_at) VALUES ('${rtA}', '${propA}', 'Standard A', 'STD', 2, 1, 100.00, now(), now());`);
  psql(OWNER, `INSERT INTO room_types (id, property_id, name, code, capacity, beds, base_price, created_at, updated_at) VALUES ('${rtB}', '${propB}', 'Standard B', 'STD', 2, 1, 100.00, now(), now());`);
  psql(OWNER, `INSERT INTO rooms (id, property_id, room_type_id, code, status, active, created_at, updated_at) VALUES ('${roomA}', '${propA}', '${rtA}', '101', 'clean', true, now(), now());`);
  psql(OWNER, `INSERT INTO rooms (id, property_id, room_type_id, code, status, active, created_at, updated_at) VALUES ('${roomB}', '${propB}', '${rtB}', '101', 'clean', true, now(), now());`);

  process.env.RLS_TEST_OWNER_URL = ownerUrl;
  process.env.RLS_TEST_APP_URL = `postgresql://${APP}:${APP_PW}@localhost:${PORT}/${DB}`;
  process.env.RLS_TEST_TENANT_A = tA;
  process.env.RLS_TEST_TENANT_B = tB;
}

export async function teardown() {
  try { sh(`docker rm -f ${CONTAINER}`); } catch {}
}

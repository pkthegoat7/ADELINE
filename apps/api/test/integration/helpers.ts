import { PrismaClient } from '@adelina/db';

export function appClient() {
  return new PrismaClient({ datasources: { db: { url: process.env.RLS_TEST_APP_URL } } });
}
export function ownerClient() {
  return new PrismaClient({ datasources: { db: { url: process.env.RLS_TEST_OWNER_URL } } });
}
export const TENANT_A = () => process.env.RLS_TEST_TENANT_A!;
export const TENANT_B = () => process.env.RLS_TEST_TENANT_B!;

export async function withTenant<T>(c: PrismaClient, tenantId: string, fn: (tx: PrismaClient) => Promise<T>) {
  return c.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
    return fn(tx as unknown as PrismaClient);
  });
}
export async function withSystem<T>(c: PrismaClient, fn: (tx: PrismaClient) => Promise<T>) {
  return c.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx as unknown as PrismaClient);
  });
}

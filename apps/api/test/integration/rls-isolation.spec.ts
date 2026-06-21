import { afterAll, describe, expect, it } from 'vitest';
import { appClient, ownerClient, withSystem, withTenant, TENANT_A, TENANT_B } from './helpers';

const app = appClient();
const owner = ownerClient();
afterAll(async () => { await app.$disconnect(); await owner.$disconnect(); });

describe('RLS isolation (conectado como adelina_app, não-superuser)', () => {
  it('withTenant(A) só enxerga reservas de A', async () => {
    const rows = await withTenant(app, TENANT_A(), (tx) => tx.reservation.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenantId === TENANT_A())).toBe(true);
  });

  it('withTenant(A) NÃO encontra reserva de B por id (IDOR bloqueado)', async () => {
    const bId = await withSystem(app, async (tx) =>
      (await tx.reservation.findFirstOrThrow({ where: { tenantId: TENANT_B() } })).id);
    const found = await withTenant(app, TENANT_A(), (tx) => tx.reservation.findFirst({ where: { id: bId } }));
    expect(found).toBeNull();
  });

  it('withTenant(A) NÃO deleta reserva de B', async () => {
    const bId = await withSystem(app, async (tx) =>
      (await tx.reservation.findFirstOrThrow({ where: { tenantId: TENANT_B() } })).id);
    const res = await withTenant(app, TENANT_A(), (tx) => tx.reservation.deleteMany({ where: { id: bId } }));
    expect(res.count).toBe(0);
    const still = await withSystem(app, (tx) => tx.reservation.findFirst({ where: { id: bId } }));
    expect(still).not.toBeNull();
  });

  it('withSystem enxerga os dois tenants', async () => {
    const rows = await withSystem(app, (tx) => tx.reservation.findMany());
    const tenants = new Set(rows.map((r) => r.tenantId));
    expect(tenants.has(TENANT_A())).toBe(true);
    expect(tenants.has(TENANT_B())).toBe(true);
  });

  it('sem GUC nenhum → 0 linhas (falha fechada)', async () => {
    const n = await app.reservation.count();
    expect(n).toBe(0);
  });

  it('withTenant(A) não consegue inserir linha com tenant de B (WITH CHECK)', async () => {
    await expect(
      withTenant(app, TENANT_A(), (tx) =>
        tx.reservation.create({
          data: {
            tenantId: TENANT_B(),
            propertyId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            guestId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
            code: 'X-IDOR-1',
            status: 'confirmed',
            checkIn: new Date(),
            checkOut: new Date(Date.now() + 86400000),
            totalAmount: 0,
            netAmount: 0,
          } as never,
        }),
      ),
    ).rejects.toBeTruthy();
  });
});

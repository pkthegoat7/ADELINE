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

describe('RLS isolation — expenses (tabela adicionada depois, tenant_id direto)', () => {
  it('expenses: withTenant(A) só vê as de A e não acha as de B por id', async () => {
    const own = await withTenant(app, TENANT_A(), (tx) => tx.expense.findMany());
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((e) => e.tenantId === TENANT_A())).toBe(true);

    const bId = await withSystem(app, async (tx) =>
      (await tx.expense.findFirstOrThrow({ where: { tenantId: TENANT_B() } })).id,
    );
    const cross = await withTenant(app, TENANT_A(), (tx) =>
      tx.expense.findFirst({ where: { id: bId } }),
    );
    expect(cross).toBeNull();
  });

  it('expenses: sem GUC → 0 linhas (RLS habilitado na tabela tardia)', async () => {
    expect(await app.expense.count()).toBe(0);
  });
});

describe('RLS isolation — rooms (política helper-based: app_property_in_tenant)', () => {
  it('rooms: withTenant(A) só vê quartos de A; sem GUC → 0 linhas', async () => {
    const own = await withTenant(app, TENANT_A(), (tx) => tx.room.findMany());
    expect(own.length).toBeGreaterThan(0);

    const all = await withSystem(app, (tx) => tx.room.findMany());
    // Sistema vê ambos; tenant A só vê os seus
    expect(all.length).toBeGreaterThan(own.length);

    expect(await app.room.count()).toBe(0); // sem GUC → 0 (RLS fecha tudo)
  });

  it('rooms: withTenant(A) não encontra quarto de B por id', async () => {
    const bRoomId = await withSystem(app, async (tx) => {
      const r = await tx.room.findFirst({
        where: { property: { tenantId: TENANT_B() } },
      });
      return r!.id;
    });
    const cross = await withTenant(app, TENANT_A(), (tx) =>
      tx.room.findFirst({ where: { id: bRoomId } }),
    );
    expect(cross).toBeNull();
  });
});

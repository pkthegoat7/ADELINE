import { afterAll, describe, expect, it } from 'vitest';
import { appClient, withSystem } from './helpers';

const app = appClient();
afterAll(async () => { await app.$disconnect(); });

describe('fluxos de sistema sob RLS enforçado', () => {
  it('lookup de user por email (login) funciona via withSystem', async () => {
    const u = await withSystem(app, (tx) => tx.user.findUnique({ where: { email: 'owner-a@x.com' } }));
    expect(u?.email).toBe('owner-a@x.com');
  });

  it('listagem cross-tenant (admin) funciona via withSystem', async () => {
    const users = await withSystem(app, (tx) => tx.user.findMany());
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it('sem withSystem, lookup por email retorna null (RLS nega)', async () => {
    const u = await app.user.findUnique({ where: { email: 'owner-a@x.com' } });
    expect(u).toBeNull();
  });
});

import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@adelina/db';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executa um callback dentro de uma transação com `app.current_tenant`
   * setado para o tenantId. Todas as queries dentro herdam o RLS daquele tenant.
   *
   * Uso:
   *   await prisma.withTenant(tenantId, async (tx) => {
   *     return tx.reservation.findMany();
   *   });
   */
  /**
   * Executa o callback numa transação com RLS escopado ao tenant.
   * Usa set_config parametrizado (sem interpolação de string → sem SQLi) e
   * garante que o bypass de sistema esteja DESLIGADO.
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }

  /**
   * Executa o callback numa transação que IGNORA o RLS de tenant (app.bypass_rls='on').
   * USO RESTRITO: apenas queries de sistema legítimas — autenticação (lookup por
   * email/id antes de haver tenant), super-admin cross-tenant, endpoints públicos
   * autenticados por token de 128 bits, e workers que varrem todos os tenants.
   * NUNCA usar em endpoint comum de pousada — isso reabriria o vazamento cross-tenant.
   */
  async withSystem<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}

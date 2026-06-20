import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export const DEFAULT_TERMS_OF_SERVICE =
  'Ao concluir este pagamento, você confirma a reserva e declara estar de acordo com as ' +
  'políticas de hospedagem, check-in, check-out e cancelamento informadas pela pousada. ' +
  'O valor é processado de forma segura pelo Mercado Pago; a pousada não armazena os dados ' +
  'do seu cartão.';

export const DEFAULT_LGPD_CONSENT =
  'Autorizo o tratamento dos meus dados pessoais pela pousada, na condição de controladora, ' +
  'para processar este pagamento e gerir a minha reserva, conforme a Lei Geral de Proteção de ' +
  'Dados (LGPD, Lei nº 13.709/2018). Os dados não serão usados para outras finalidades sem o ' +
  'meu consentimento, e eu posso solicitar acesso, correção ou exclusão a qualquer momento ' +
  'pelos canais de atendimento da pousada.';

export const TENANT_SETTING_KEYS = [
  'payment_terms_of_service',
  'payment_lgpd_consent',
  'payment_link_auto_whatsapp',
] as const;

export type TenantSettingKey = (typeof TENANT_SETTING_KEYS)[number];

@Injectable()
export class TenantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Retorna todas as settings da pousada como mapa, com defaults aplicados. */
  async getAll(tenantId: string): Promise<Record<TenantSettingKey, string>> {
    const rows = await this.prisma.tenantSetting.findMany({ where: { tenantId } });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      payment_terms_of_service:
        map.get('payment_terms_of_service') || DEFAULT_TERMS_OF_SERVICE,
      payment_lgpd_consent: map.get('payment_lgpd_consent') || DEFAULT_LGPD_CONSENT,
      payment_link_auto_whatsapp: map.get('payment_link_auto_whatsapp') || 'false',
    };
  }

  async get(tenantId: string, key: TenantSettingKey): Promise<string> {
    const all = await this.getAll(tenantId);
    return all[key];
  }

  async set(tenantId: string, key: TenantSettingKey, value: string): Promise<void> {
    await this.prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value },
      update: { value },
    });
  }
}

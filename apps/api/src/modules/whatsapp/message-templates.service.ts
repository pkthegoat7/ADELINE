import { Injectable } from '@nestjs/common';
import { MessageTemplateType } from '@adelina/db';
import { PrismaService } from '../../common/prisma/prisma.service';

export type TemplateType = `${MessageTemplateType}`;

export interface TemplateDefault {
  body: string;
  /** Hora local BRT padrão (apenas para tipos agendados). */
  hourBrt: number | null;
  /** Variáveis suportadas pelo template (chave → descrição amigável). */
  vars: Record<string, string>;
  /** Rótulo amigável em PT-BR para a UI. */
  label: string;
  /** Texto curto explicando quando essa mensagem dispara. */
  trigger: string;
}

/**
 * Defaults hardcoded — espelham o texto original antes da feature de templates.
 * Se um tenant nunca editou, o `render()` usa estes valores.
 *
 * Variáveis usam o formato `{nome}` e são substituídas literalmente.
 * Pra evitar problemas com texto digitado pelo dono, a substituição é manual
 * (sem template literal eval).
 */
export const TEMPLATE_DEFAULTS: Record<TemplateType, TemplateDefault> = {
  checkin_tomorrow: {
    label: 'Lembrete de check-in (1 dia antes)',
    trigger: 'Enviado automaticamente no dia anterior ao check-in.',
    body:
      'Olá, {primeiro_nome}! 👋 Aqui é da {pousada}.\n\n' +
      'Lembrete: seu check-in é amanhã, {checkin}, a partir das 14h.\n' +
      'Reserva {codigo_reserva}. Qualquer dúvida é só responder por aqui. Até amanhã! 🏡',
    hourBrt: 10,
    vars: {
      primeiro_nome: 'Primeiro nome do hóspede principal',
      pousada: 'Nome da propriedade',
      checkin: 'Data de check-in (dd/MM)',
      codigo_reserva: 'Código da reserva (ex: ADL-2026-00012)',
    },
  },
  post_checkout: {
    label: 'Agradecimento pós-checkout',
    trigger: 'Enviado automaticamente no dia seguinte ao checkout.',
    body:
      'Olá, {primeiro_nome}! Aqui é da {pousada} 🏡\n\n' +
      'Esperamos que sua estadia tenha sido ótima! Obrigado pela visita 💛\n' +
      'Se puder, deixe uma avaliação — ajuda muito a nossa pousada. Até a próxima!',
    hourBrt: 11,
    vars: {
      primeiro_nome: 'Primeiro nome do hóspede principal',
      pousada: 'Nome da propriedade',
    },
  },
  pending_registration: {
    label: 'Cobrança de ficha pendente',
    trigger:
      'Enviado uma única vez quando o hóspede recebe o link mas não preenche em 24h.',
    body:
      'Olá! Aqui é da {pousada} 👋\n\n' +
      'Ainda não recebemos sua ficha de cadastro. Leva menos de 2 minutos:\n{link}',
    hourBrt: 10,
    vars: {
      pousada: 'Nome da pousada',
      link: 'Link público da ficha',
    },
  },
  registration_link: {
    label: 'Envio do link de cadastro',
    trigger: 'Enviado manualmente quando você cria um link de ficha pra um hóspede.',
    // O default é montado dinamicamente porque varia se tem reserva ou não;
    // o render() trata os dois casos via {com_reserva}.
    body:
      'Olá! 👋 Aqui é da {pousada}.\n\n' +
      '{intro_reserva}Complete sua ficha de cadastro pelo link abaixo (válido por {dias} dias):\n{link}',
    hourBrt: null,
    vars: {
      pousada: 'Nome da pousada',
      intro_reserva:
        'Frase com código da reserva e data (vazio quando link não tem reserva)',
      dias: 'Dias até o link expirar',
      link: 'Link público da ficha',
    },
  },
  password_reset: {
    label: 'Link de redefinição de senha',
    trigger: 'Enviado pro número conectado quando alguém clica em "Esqueci minha senha".',
    body:
      '🔑 Redefinição de senha solicitada para {email}.\n\n' +
      'Se foi você (ou alguém da equipe), use o link (válido por {minutos} min):\n{link}\n\n' +
      'Se não reconhece o pedido, ignore.',
    hourBrt: null,
    vars: {
      email: 'Email da conta que pediu o reset',
      minutos: 'Minutos até o link expirar',
      link: 'Link de redefinição',
    },
  },
};

export const TEMPLATE_TYPES = Object.keys(TEMPLATE_DEFAULTS) as TemplateType[];

export const SCHEDULED_TYPES: TemplateType[] = [
  'checkin_tomorrow',
  'post_checkout',
  'pending_registration',
];

export interface ResolvedTemplate {
  type: TemplateType;
  body: string;
  enabled: boolean;
  hourBrt: number | null;
  isCustom: boolean;
  default: TemplateDefault;
}

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve um template (override do tenant ou default). */
  async resolve(tenantId: string, type: TemplateType): Promise<ResolvedTemplate> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.messageTemplate.findUnique({ where: { tenantId_type: { tenantId, type } } }),
    );
    const def = TEMPLATE_DEFAULTS[type];
    return {
      type,
      body: row?.body ?? def.body,
      enabled: row?.enabled ?? true,
      hourBrt: row?.hourBrt ?? def.hourBrt,
      isCustom: !!row,
      default: def,
    };
  }

  /** Lista todos os templates resolvidos (pra UI). */
  async listAll(tenantId: string): Promise<ResolvedTemplate[]> {
    const rows = await this.prisma.withTenant(tenantId, (tx) =>
      tx.messageTemplate.findMany(),
    );
    const byType = new Map(rows.map((r) => [r.type as TemplateType, r]));
    return TEMPLATE_TYPES.map((type) => {
      const row = byType.get(type);
      const def = TEMPLATE_DEFAULTS[type];
      return {
        type,
        body: row?.body ?? def.body,
        enabled: row?.enabled ?? true,
        hourBrt: row?.hourBrt ?? def.hourBrt,
        isCustom: !!row,
        default: def,
      };
    });
  }

  /** Atualiza (ou cria) um template do tenant. Passar `null` em qualquer campo o restaura. */
  async upsert(
    tenantId: string,
    type: TemplateType,
    patch: { body?: string; enabled?: boolean; hourBrt?: number | null },
  ): Promise<ResolvedTemplate> {
    const current = await this.resolve(tenantId, type);
    const body = patch.body ?? current.body;
    const enabled = patch.enabled ?? current.enabled;
    const hourBrt = SCHEDULED_TYPES.includes(type)
      ? patch.hourBrt === undefined
        ? current.hourBrt
        : patch.hourBrt
      : null;

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.messageTemplate.upsert({
        where: { tenantId_type: { tenantId, type } },
        create: { tenantId, type, body, enabled, hourBrt },
        update: { body, enabled, hourBrt },
      }),
    );
    return this.resolve(tenantId, type);
  }

  /** Volta ao default removendo o override. */
  async reset(tenantId: string, type: TemplateType): Promise<ResolvedTemplate> {
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.messageTemplate
        .delete({ where: { tenantId_type: { tenantId, type } } })
        .catch(() => null),
    );
    return this.resolve(tenantId, type);
  }

  /**
   * Renderiza um template substituindo `{var}` pelos valores em `vars`.
   * Retorna `null` se o tenant desativou esse tipo de mensagem — quem chama deve simplesmente pular o envio.
   */
  async render(
    tenantId: string,
    type: TemplateType,
    vars: Record<string, string | number>,
  ): Promise<string | null> {
    const tpl = await this.resolve(tenantId, type);
    if (!tpl.enabled) return null;
    return interpolate(tpl.body, vars);
  }
}

/** Substitui `{chave}` por `vars[chave]`. Chaves não fornecidas viram string vazia. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (_, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

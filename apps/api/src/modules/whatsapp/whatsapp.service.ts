import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type EvolutionJson = Record<string, any> | null;

/**
 * Integração com a Evolution API (gateway de WhatsApp self-hosted).
 * Uma instância Evolution por tenant: `adelina-{slug}`.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly prisma: PrismaService) {}

  get configured(): boolean {
    return !!process.env.EVOLUTION_API_URL && !!process.env.EVOLUTION_API_KEY;
  }

  private async evo(path: string, init: RequestInit = {}): Promise<EvolutionJson> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Integração WhatsApp não configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY.',
      );
    }
    const base = process.env.EVOLUTION_API_URL!.replace(/\/+$/, '');
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        apikey: process.env.EVOLUTION_API_KEY!,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let json: EvolutionJson = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* resposta não-JSON: mantém null */
    }
    if (!res.ok) {
      this.logger.warn(
        `Evolution ${init.method ?? 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`,
      );
      const msg =
        (json as any)?.response?.message ??
        (json as any)?.message ??
        `Evolution API respondeu ${res.status}`;
      throw new BadRequestException(Array.isArray(msg) ? msg.join('; ') : String(msg));
    }
    return json;
  }

  /** Garante a instância Evolution do tenant (cria se não existir). */
  async ensureInstance(tenantId: string) {
    const existing = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.findUnique({ where: { tenantId } }),
    );
    if (existing) return existing;

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const instanceName = `adelina-${tenant.slug}`;

    try {
      await this.evo('/instance/create', {
        method: 'POST',
        body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      });
    } catch (err) {
      // Instância pode já existir na Evolution (ex.: recriação do registro local)
      const msg = (err as Error).message ?? '';
      if (!/already|in use|exists/i.test(msg)) throw err;
    }

    return this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.create({ data: { tenantId, instanceName } }),
    );
  }

  /** Retorna QR code / pairing code pra conectar o WhatsApp. */
  async connect(tenantId: string) {
    const inst = await this.ensureInstance(tenantId);
    const json = (await this.evo(`/instance/connect/${inst.instanceName}`)) ?? {};
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.update({ where: { tenantId }, data: { status: 'connecting' } }),
    );
    const base64: string | undefined =
      json.base64 ?? json.qrcode?.base64 ?? json.qr?.base64;
    return {
      qrBase64: typeof base64 === 'string' ? base64 : undefined,
      pairingCode: json.pairingCode ?? json.qrcode?.pairingCode ?? undefined,
      code: json.code ?? json.qrcode?.code ?? undefined,
    };
  }

  /**
   * Reinicia a instância (logout + delete na Evolution) e gera um QR code novo.
   * Útil quando a conexão fica presa em "connecting" sem QR válido.
   */
  async restart(tenantId: string) {
    const inst = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.findUnique({ where: { tenantId } }),
    );
    if (inst) {
      // Tenta limpar do lado da Evolution (best-effort)
      try {
        await this.evo(`/instance/logout/${inst.instanceName}`, { method: 'DELETE' });
      } catch {
        /* já desconectada */
      }
      try {
        await this.evo(`/instance/delete/${inst.instanceName}`, { method: 'DELETE' });
      } catch (err) {
        this.logger.warn(`restart delete: ${(err as Error).message}`);
      }
      // Remove o registro local pra forçar recriação
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.whatsappInstance.delete({ where: { tenantId } }),
      );
    }
    return this.connect(tenantId);
  }

  /** Estado atual da conexão (consulta a Evolution e sincroniza o registro). */
  async status(tenantId: string) {
    const inst = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.findUnique({ where: { tenantId } }),
    );
    if (!this.configured) return { configured: false, instance: null, state: 'disconnected' };
    if (!inst) return { configured: true, instance: null, state: 'disconnected' };

    let state: 'connected' | 'connecting' | 'disconnected' = 'disconnected';
    let phoneNumber: string | null = inst.phoneNumber;
    try {
      const json = (await this.evo(`/instance/connectionState/${inst.instanceName}`)) ?? {};
      const raw = json.instance?.state ?? json.state;
      state = raw === 'open' ? 'connected' : raw === 'connecting' ? 'connecting' : 'disconnected';
      if (state === 'connected' && !phoneNumber) {
        const list = (await this.evo(
          `/instance/fetchInstances?instanceName=${inst.instanceName}`,
        )) as any;
        const item = Array.isArray(list) ? list[0] : list;
        const owner: string | undefined =
          item?.instance?.owner ?? item?.owner ?? item?.ownerJid ?? undefined;
        if (owner) phoneNumber = owner.replace(/@.*$/, '');
      }
    } catch (err) {
      this.logger.warn(`status check falhou: ${(err as Error).message}`);
    }

    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.update({
        where: { tenantId },
        data: { status: state, phoneNumber },
      }),
    );
    return { configured: true, instance: updated, state };
  }

  /** Desconecta o WhatsApp (logout na Evolution). */
  async disconnect(tenantId: string) {
    const inst = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.findUnique({ where: { tenantId } }),
    );
    if (!inst) return { ok: true };
    try {
      await this.evo(`/instance/logout/${inst.instanceName}`, { method: 'DELETE' });
    } catch (err) {
      this.logger.warn(`logout falhou: ${(err as Error).message}`);
    }
    await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.update({
        where: { tenantId },
        data: { status: 'disconnected', phoneNumber: null },
      }),
    );
    return { ok: true };
  }

  /** Remove a instância da Evolution (usado ao excluir uma pousada). */
  async deleteInstance(tenantId: string) {
    const inst = await this.prisma.whatsappInstance.findUnique({ where: { tenantId } });
    if (!inst) return { ok: true };
    try {
      await this.evo(`/instance/logout/${inst.instanceName}`, { method: 'DELETE' });
    } catch {
      /* já desconectada */
    }
    await this.evo(`/instance/delete/${inst.instanceName}`, { method: 'DELETE' }).catch(
      (err) => this.logger.warn(`delete instance: ${(err as Error).message}`),
    );
    return { ok: true };
  }

  /**
   * Envia mensagem de texto. Normaliza telefone BR (DDI 55 implícito).
   * Ponto único de envio — lembretes, links de cadastro e check-in passam por aqui.
   */
  async sendText(tenantId: string, phone: string, text: string) {
    const inst = await this.prisma.withTenant(tenantId, (tx) =>
      tx.whatsappInstance.findUnique({ where: { tenantId } }),
    );
    if (!inst) {
      throw new BadRequestException('WhatsApp não conectado. Conecte na aba Canais.');
    }
    const number = this.normalizePhone(phone);
    try {
      await this.evo(`/message/sendText/${inst.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number, text }),
      });
    } catch {
      // Fallback pro formato da Evolution v1
      await this.evo(`/message/sendText/${inst.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number, options: { delay: 0 }, textMessage: { text } }),
      });
    }
    return { ok: true, number };
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // 10-11 dígitos = número BR sem DDI
    return digits.length <= 11 ? `55${digits}` : digits;
  }
}

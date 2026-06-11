import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { format } from 'date-fns';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { publicWebUrl } from '../../common/public-url';
import { Public } from '../auth/public.decorator';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const LINK_TTL_DAYS = 7;
const MAX_DOC_BASE64_CHARS = 11_000_000; // ~8MB de arquivo
// Só imagem/PDF: bloqueia HTML/SVG (XSS armazenado via URL assinada)
const ALLOWED_DOC_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const CreateLinkSchema = z.object({
  phone: z.string().min(8),
  reservationId: z.string().uuid().optional(),
});

const DocumentTypeEnum = z.enum(['cpf', 'rg', 'passport', 'cnh', 'other']);

const CompanionSchema = z.object({
  fullName: z.string().min(1),
  documentType: DocumentTypeEnum.default('cpf'),
  document: z.string().optional(),
  birthDate: z.string().optional(),
});

const SubmitSchema = z.object({
  fullName: z.string().min(2),
  documentType: DocumentTypeEnum.default('cpf'),
  document: z.string().min(3),
  email: z.string().email().optional(),
  birthDate: z.string().optional(),
  nationality: z.string().optional(),
  documentFile: z
    .object({
      base64: z.string().max(MAX_DOC_BASE64_CHARS, 'Arquivo muito grande (máx. 8MB)'),
      name: z.string().min(1),
      mime: z
        .string()
        .refine((m) => ALLOWED_DOC_MIMES.includes(m), 'Envie foto (JPG/PNG) ou PDF.'),
    })
    .optional(),
  companions: z.array(CompanionSchema).max(10).default([]),
});


@ApiTags('guest-links')
@ApiBearerAuth()
@Controller('guest-links')
export class GuestLinksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Cria link de cadastro (opcionalmente vinculado a uma reserva) e envia via WhatsApp. */
  @Post()
  async create(@TenantId() tenantId: string, @Body() body: unknown) {
    const { phone, reservationId } = CreateLinkSchema.parse(body);
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Valida ownership da reserva antes de vincular
    const reservation = reservationId
      ? await this.prisma.withTenant(tenantId, (tx) =>
          tx.reservation.findUniqueOrThrow({ where: { id: reservationId } }),
        )
      : null;

    const link = await this.prisma.withTenant(tenantId, (tx) =>
      tx.guestRegistrationLink.create({
        data: { tenantId, token, phone, expiresAt, reservationId },
      }),
    );

    const url = `${publicWebUrl()}/cadastro/${link.token}`;

    let sentViaWhatsapp = false;
    let whatsappError: string | null = null;
    try {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const intro = reservation
        ? `Olá! 👋 Aqui é da ${tenant.name}.\n\nRecebemos sua reserva ${reservation.code} (check-in ${format(reservation.checkIn, 'dd/MM')}). Pra agilizar sua chegada, complete sua ficha de cadastro:`
        : `Olá! 👋 Aqui é da ${tenant.name}.\n\nComplete sua ficha de cadastro pelo link abaixo (válido por ${LINK_TTL_DAYS} dias):`;
      await this.whatsapp.sendText(tenantId, phone, `${intro}\n${url}`);
      sentViaWhatsapp = true;
    } catch (err) {
      whatsappError = (err as Error).message;
    }

    return { id: link.id, url, phone, expiresAt, sentViaWhatsapp, whatsappError };
  }

  /** Lista links recentes (pra acompanhar quem já preencheu). */
  @Get()
  list(@TenantId() tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.guestRegistrationLink.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { guest: { select: { id: true, fullName: true } } },
      }),
    );
  }

  /** URL assinada (1h) do documento anexado por um hóspede. */
  @Get('guests/:guestId/document-url')
  async documentUrl(@TenantId() tenantId: string, @Param('guestId') guestId: string) {
    const guest = await this.prisma.withTenant(tenantId, (tx) =>
      tx.guest.findUniqueOrThrow({ where: { id: guestId } }),
    );
    if (!guest.documentFilePath) {
      throw new NotFoundException('Hóspede não tem documento anexado.');
    }
    const { data, error } = this.storage()
      ? await this.storage()!.storage.from('guest-docs').createSignedUrl(guest.documentFilePath, 3600)
      : { data: null, error: new Error('Storage não configurado') };
    if (error || !data) throw new BadRequestException(`Falha ao gerar URL: ${error?.message}`);
    return { url: data.signedUrl };
  }

  /** Dados públicos do link (pra ficha carregar nome da pousada e estadia). */
  @Public()
  @Get('public/:token')
  async publicInfo(@Param('token') token: string) {
    const link = await this.findValidLink(token);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: link.tenantId } });
    const reservation = link.reservationId
      ? await this.prisma.reservation.findUnique({
          where: { id: link.reservationId },
          select: { code: true, checkIn: true, checkOut: true },
        })
      : null;
    return { pousada: tenant.name, phone: link.phone, status: link.status, reservation };
  }

  /** Hóspede envia a ficha preenchida (público, sem login). */
  @Public()
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @Post('public/:token/submit')
  async submit(@Param('token') token: string, @Body() body: unknown) {
    const link = await this.findValidLink(token);
    const data = SubmitSchema.parse(body);

    // Upload do documento (se anexado) antes da transação
    let documentFilePath: string | null = null;
    if (data.documentFile) {
      const storage = this.storage();
      if (!storage) throw new BadRequestException('Armazenamento de documentos indisponível.');
      const safeName = data.documentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `${link.tenantId}/${link.token}/${safeName}`;
      const buffer = Buffer.from(data.documentFile.base64.replace(/^data:[^,]+,/, ''), 'base64');
      const { error } = await storage.storage
        .from('guest-docs')
        .upload(path, buffer, { contentType: data.documentFile.mime, upsert: true });
      if (error) throw new BadRequestException(`Falha no upload do documento: ${error.message}`);
      documentFilePath = path;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.create({
        data: {
          tenantId: link.tenantId,
          fullName: data.fullName,
          documentType: data.documentType,
          document: data.document,
          email: data.email,
          phone: link.phone,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          nationality: data.nationality,
          documentFilePath,
          notes: 'Cadastro via ficha enviada por WhatsApp',
        },
      });

      const companions = [];
      for (const c of data.companions) {
        companions.push(
          await tx.guest.create({
            data: {
              tenantId: link.tenantId,
              fullName: c.fullName,
              documentType: c.documentType,
              document: c.document,
              birthDate: c.birthDate ? new Date(c.birthDate) : undefined,
              primaryGuestId: guest.id,
              notes: `Acompanhante de ${data.fullName}`,
            },
          }),
        );
      }

      // Ficha vinculada a reserva: hóspedes entram na reserva com FNRH
      // e o titular substitui o placeholder vindo do canal
      if (link.reservationId) {
        const { documentFile: _file, ...fnrhData } = data;
        await tx.reservationGuest.create({
          data: {
            reservationId: link.reservationId,
            guestId: guest.id,
            isPrimary: true,
            fnrhData,
            fnrhSignedAt: new Date(),
          },
        });
        for (const c of companions) {
          await tx.reservationGuest.create({
            data: { reservationId: link.reservationId, guestId: c.id },
          });
        }
        await tx.reservation.update({
          where: { id: link.reservationId },
          data: { guestId: guest.id },
        });
      }

      await tx.guestRegistrationLink.update({
        where: { id: link.id },
        data: { status: 'completed', guestId: guest.id, completedAt: new Date() },
      });

      return guest;
    });

    return { ok: true, guestId: result.id };
  }

  private async findValidLink(token: string) {
    // Lookup público por token: service role, sem contexto de tenant
    const link = await this.prisma.guestRegistrationLink.findUnique({ where: { token } });
    if (!link) throw new NotFoundException('Link de cadastro não encontrado.');
    if (link.status === 'completed') {
      throw new BadRequestException('Esta ficha já foi preenchida. Obrigado!');
    }
    if (link.status === 'expired' || link.expiresAt < new Date()) {
      throw new BadRequestException('Este link expirou. Peça um novo à pousada.');
    }
    return link;
  }

  private storage() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
}

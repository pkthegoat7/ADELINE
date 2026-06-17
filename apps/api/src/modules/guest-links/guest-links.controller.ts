import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { FastifyReply } from 'fastify';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { format } from 'date-fns';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { publicWebUrl } from '../../common/public-url';
import { Public } from '../auth/public.decorator';
import { MessageTemplatesService } from '../whatsapp/message-templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const LINK_TTL_DAYS = 7;
const MAX_DOC_BASE64_CHARS = 11_000_000; // ~8MB de arquivo
// Storage próprio: documentos ficam num volume da VPS
const DOCS_DIR = process.env.GUEST_DOCS_DIR ?? '/data/guest-docs';
const DOC_URL_TTL_SEC = 3600;

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

const SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

function docSignature(relPath: string, exp: number): string {
  const secret = process.env.AUTH_JWT_SECRET ?? '';
  return createHmac('sha256', secret).update(`${relPath}|${exp}`).digest('hex').slice(0, 32);
}
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

const AddressSchema = z.object({
  cep: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

const SubmitSchema = z.object({
  fullName: z.string().min(2),
  documentType: DocumentTypeEnum.default('cpf'),
  document: z.string().min(3),
  email: z.string().email().optional(),
  birthDate: z.string().optional(),
  nationality: z.string().optional(),
  address: AddressSchema.optional(),
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
    private readonly templates: MessageTemplatesService,
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
      const introReserva = reservation
        ? `Recebemos sua reserva ${reservation.code} (check-in ${format(reservation.checkIn, 'dd/MM')}). Pra agilizar sua chegada, `
        : '';
      const msg = await this.templates.render(tenantId, 'registration_link', {
        pousada: tenant.name,
        intro_reserva: introReserva,
        dias: LINK_TTL_DAYS,
        link: url,
      });
      if (msg) {
        await this.whatsapp.sendText(tenantId, phone, msg);
        sentViaWhatsapp = true;
      } else {
        whatsappError = 'Envio automático desativado nas configurações.';
      }
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
    const base = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '');
    const exp = Math.floor(Date.now() / 1000) + DOC_URL_TTL_SEC;
    const sig = docSignature(guest.documentFilePath, exp);
    return { url: `${base}/api/guest-links/files/${guest.documentFilePath}?exp=${exp}&sig=${sig}` };
  }

  /** Serve o documento do volume — público mas só com assinatura válida (1h). */
  @Public()
  @Get('files/:tenantId/:token/:name')
  async serveFile(
    @Param('tenantId') tenantId: string,
    @Param('token') token: string,
    @Param('name') name: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: FastifyReply,
  ) {
    const relPath = `${tenantId}/${token}/${name}`;
    const expNum = Number(exp);
    if (
      ![tenantId, token, name].every((s) => SEGMENT_RE.test(s)) ||
      !Number.isFinite(expNum) ||
      expNum < Date.now() / 1000
    ) {
      throw new BadRequestException('Link expirado ou inválido.');
    }
    const expected = docSignature(relPath, expNum);
    const given = String(sig ?? '');
    if (
      given.length !== expected.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      throw new BadRequestException('Assinatura inválida.');
    }
    const full = join(DOCS_DIR, tenantId, token, name);
    if (!existsSync(full)) throw new NotFoundException('Arquivo não encontrado.');

    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    res.header('Content-Type', EXT_MIME[ext] ?? 'application/octet-stream');
    res.header('Content-Disposition', `inline; filename="${name}"`);
    res.header('Cache-Control', 'private, max-age=300');
    return res.send(createReadStream(full));
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

    // Grava o documento (se anexado) no volume antes da transação
    let documentFilePath: string | null = null;
    if (data.documentFile) {
      const safeName =
        data.documentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'documento';
      const dir = join(DOCS_DIR, link.tenantId, link.token);
      const buffer = Buffer.from(data.documentFile.base64.replace(/^data:[^,]+,/, ''), 'base64');
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, safeName), buffer);
      } catch (err) {
        throw new BadRequestException(`Falha ao salvar documento: ${(err as Error).message}`);
      }
      documentFilePath = `${link.tenantId}/${link.token}/${safeName}`;
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
          address: data.address ?? undefined,
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

}

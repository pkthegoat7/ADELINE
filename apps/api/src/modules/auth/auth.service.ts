import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { PrismaService } from '../../common/prisma/prisma.service';
import { publicWebUrl } from '../../common/public-url';
import { MessageTemplatesService } from '../whatsapp/message-templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

export const AUTH_COOKIE = 'adelina_token';
const TOKEN_TTL = '7d';
const RESET_TTL_MIN = 30;

export interface SessionPayload extends JWTPayload {
  sub: string;
  email: string;
}

function jwtSecret(): Uint8Array {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_JWT_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  }
  return new TextEncoder().encode(s);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly templates: MessageTemplatesService,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return hash(plain, 10);
  }

  async login(email: string, password: string) {
    // Auth lookup is pre-tenant — bypass RLS to find user by email.
    const user = await this.prisma.withSystem((tx) =>
      tx.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: { tenant: { select: { status: true } } },
      }),
    );
    // Mesma mensagem pra usuário inexistente e senha errada (evita enumeração)
    const fail = () => new UnauthorizedException('Email ou senha incorretos.');
    if (!user || !user.active) throw fail();
    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Pousada suspensa. Entre em contato com o suporte.');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Conta sem senha definida. Use "Esqueci minha senha" pra criar uma.',
      );
    }
    if (!(await compare(password, user.passwordHash))) throw fail();

    const token = await this.signToken(user.id, user.email);
    return {
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }

  async signToken(userId: string, email: string): Promise<string> {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('adelina-pms')
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(jwtSecret());
  }

  async verifyToken(token: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(token, jwtSecret(), { issuer: 'adelina-pms' });
    return payload as SessionPayload;
  }

  /** Monta o Set-Cookie da sessão (httpOnly; Domain compartilhado web/api). */
  sessionCookie(token: string | null): string {
    const domain = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : '';
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    if (token === null) {
      return `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${domain}${secure}`;
    }
    const maxAge = 7 * 24 * 60 * 60;
    return `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${domain}${secure}`;
  }

  /**
   * "Esqueci minha senha" sem email: o link de redefinição é enviado pro
   * WhatsApp conectado da pousada (o aparelho fica com o dono/recepção).
   */
  async forgotPassword(email: string): Promise<void> {
    // Fetch user + instance + create token inside withSystem (pre-tenant lookup).
    // Network call (WhatsApp send) happens AFTER the transaction to avoid holding
    // a DB connection during a slow HTTP request.
    const result = await this.prisma.withSystem(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (!user || !user.active) return null; // resposta idêntica, sem enumeração

      const instance = await tx.whatsappInstance.findUnique({
        where: { tenantId: user.tenantId },
      });
      if (!instance?.phoneNumber || instance.status !== 'connected') {
        this.logger.warn(`forgot-password sem WhatsApp conectado (tenant ${user.tenantId})`);
        return null;
      }

      const token = randomBytes(24).toString('hex');
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
        },
      });

      return { user, instance, token };
    });

    if (!result) return;

    const { user, instance, token } = result;
    const url = `${publicWebUrl()}/redefinir-senha?token=${token}`;
    const msg = await this.templates.render(user.tenantId, 'password_reset', {
      email: user.email,
      minutos: RESET_TTL_MIN,
      link: url,
    });
    if (!msg) {
      this.logger.warn(`reset password desativado nas configurações (tenant ${user.tenantId})`);
      return;
    }
    await this.whatsapp
      // phoneNumber is guaranteed non-null: the withSystem block returns null if it's missing.
      .sendText(user.tenantId, instance.phoneNumber!, msg)
      .catch((err) => this.logger.warn(`reset via whatsapp falhou: ${(err as Error).message}`));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Token lookup is cross-tenant by nature — bypass RLS.
    const passwordHash = await this.hashPassword(newPassword);
    await this.prisma.withSystem(async (tx) => {
      const row = await tx.passwordResetToken.findUnique({
        where: { token },
        include: { user: true },
      });
      if (!row || row.usedAt || row.expiresAt < new Date()) {
        throw new BadRequestException('Link inválido ou expirado. Solicite um novo.');
      }
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
    });
  }

  async changePassword(userId: string, current: string, newPassword: string): Promise<void> {
    // userId is known from JWT but the row lookup still needs RLS bypass (no tenant GUC set here).
    await this.prisma.withSystem(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.passwordHash || !(await compare(current, user.passwordHash))) {
        throw new BadRequestException('Senha atual incorreta.');
      }
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await this.hashPassword(newPassword) },
      });
    });
  }

  /** Cria usuário local (substitui o admin.createUser do Supabase). */
  async createLocalUser(input: {
    tenantId: string;
    email: string;
    password: string;
    fullName: string;
    role: 'owner' | 'manager' | 'receptionist' | 'housekeeper' | 'readonly';
  }) {
    const passwordHash = await this.hashPassword(input.password);
    // User creation is a system operation (cross-tenant by super-admin).
    return this.prisma.withSystem((tx) =>
      tx.user.create({
        data: {
          id: randomUUID(),
          tenantId: input.tenantId,
          email: input.email.toLowerCase().trim(),
          fullName: input.fullName,
          role: input.role,
          active: true,
          passwordHash,
        },
        select: { id: true, email: true, fullName: true, role: true, active: true },
      }),
    );
  }
}

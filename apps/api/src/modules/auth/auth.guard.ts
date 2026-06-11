import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AUTH_COOKIE, AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: unknown }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let sub: string;
    try {
      const payload = await this.auth.verifyToken(token);
      sub = payload.sub;
    } catch (err) {
      this.logger.warn(`JWT verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid token');
    }

    // Resolve tenant via tabela users (1 user = 1 tenant no MVP)
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        active: true,
        tenant: { select: { status: true } },
      },
    });
    if (!user || !user.active) throw new UnauthorizedException('User not found or inactive');
    if (user.tenant.status !== 'active') {
      throw new UnauthorizedException('Pousada suspensa. Entre em contato com o suporte.');
    }

    (req as any).user = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    return true;
  }

  /** Token via Authorization Bearer ou cookie httpOnly da sessão. */
  private extractToken(req: FastifyRequest): string | null {
    const auth = req.headers['authorization'];
    if (auth && !Array.isArray(auth) && auth.startsWith('Bearer ')) return auth.slice(7);

    const cookies = req.headers.cookie;
    if (!cookies) return null;
    for (const part of cookies.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === AUTH_COOKIE) return rest.join('=') || null;
    }
    return null;
  }
}

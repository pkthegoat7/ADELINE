import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { CAPABILITY_KEY } from './require-capability.decorator';
import { can, type Capability } from './permissions';

/**
 * Roda DEPOIS do AuthGuard (que anexa req.user). Só enforça quando o handler
 * declara @RequireCapability(...); caso contrário, libera. Super-admins NÃO
 * recebem bypass aqui — eles operam via /admin (próprio guard) e, dentro de uma
 * pousada, respeitam o papel como qualquer usuário.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<Capability | undefined>(CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capability) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: { role?: string } }>();
    const role = req.user?.role;
    if (!can(role, capability)) {
      throw new ForbiddenException('Seu nível de acesso não permite esta ação.');
    }
    return true;
  }
}

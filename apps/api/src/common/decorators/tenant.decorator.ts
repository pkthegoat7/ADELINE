import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

/** @CurrentUser() user: AuthContext  → injeta o contexto de auth resolvido pelo guard */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthContext }>();
    return req.user;
  },
);

/** @TenantId() tenantId: string */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthContext }>();
    return req.user.tenantId;
  },
);

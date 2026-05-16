import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ZodError } from 'zod';

/** Converte ZodError em 400 com mensagens legíveis em vez de 500. */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    const issues = exception.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));

    const message =
      issues.length === 1
        ? `${issues[0].field}: ${issues[0].message}`
        : `Validação falhou: ${issues.map((i) => `${i.field} (${i.message})`).join('; ')}`;

    reply.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
      issues,
    });
  }
}

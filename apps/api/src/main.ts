import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
      bodyLimit: 12_582_912, // 12MB — comporta documento do hóspede em base64 (~8MB de arquivo)
    }),
  );

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ZodExceptionFilter());

  // Security headers (XSS, clickjacking, MIME sniffing, etc).
  // contentSecurityPolicy off porque Swagger UI carrega assets externos em dev.
  await app.register(helmet as never, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  });

  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Adelina PMS API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Render/Heroku/Fly injetam PORT; local usa API_PORT do .env; fallback 3333.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3333);
  await app.listen({ port, host: '0.0.0.0' });
  Logger.log(`🚀 API on port ${port} (prefix /api · docs /api/docs)`, 'Bootstrap');
}

bootstrap();

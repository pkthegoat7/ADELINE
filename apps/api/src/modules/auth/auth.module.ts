import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { CapabilityGuard } from '../../common/capability.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [WhatsappModule],
  controllers: [AuthController],
  // Ordem importa: AuthGuard popula req.user; CapabilityGuard lê o papel depois.
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CapabilityGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}

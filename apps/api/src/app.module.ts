import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { GuestsModule } from './modules/guests/guests.module';
import { ChannelManagerModule } from './modules/channel-manager/channel-manager.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SearchModule } from './modules/search/search.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { GuestLinksModule } from './modules/guest-links/guest-links.module';
import { TeamModule } from './modules/team/team.module';
import { AdminModule } from './modules/admin/admin.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ExpensesModule } from './modules/expenses/expenses.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      // Padrão: 300 req/min por IP — telas como dashboard/calendar abrem várias
      // queries em paralelo; 100 estourava só ao logar com várias abas abertas
      { name: 'default', ttl: 60_000, limit: 300 },
      // Rigoroso: 5 req/min — usado em endpoints sensíveis via @Throttle
      { name: 'strict', ttl: 60_000, limit: 5 },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    PropertiesModule,
    RoomsModule,
    ReservationsModule,
    AvailabilityModule,
    GuestsModule,
    ChannelManagerModule,
    DashboardModule,
    SearchModule,
    WhatsappModule,
    GuestLinksModule,
    TeamModule,
    AdminModule,
    SubscriptionsModule,
    PaymentsModule,
    SettingsModule,
    ExpensesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

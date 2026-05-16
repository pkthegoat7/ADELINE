import { Module } from '@nestjs/common';
import { GuestsController } from './guests.controller';

@Module({ controllers: [GuestsController] })
export class GuestsModule {}

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { LegalService } from './legal.service';

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  // Endpoint público (sem auth): páginas /termos e /privacidade no web consomem isto.
  @Public()
  @Get(':doc')
  @ApiOperation({ summary: 'Retorna documento legal renderizado (termos | privacidade)' })
  @ApiParam({ name: 'doc', enum: ['termos', 'privacidade'] })
  async getDoc(@Param('doc') doc: string) {
    return this.legal.render(doc);
  }
}

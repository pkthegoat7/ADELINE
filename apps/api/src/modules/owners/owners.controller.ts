import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequireCapability } from '../../common/require-capability.decorator';
import { OwnersService } from './owners.service';

const CreateSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório.').max(160),
  document: z.string().max(40).nullish(),
  email: z.string().email('E-mail inválido.').max(160).nullish().or(z.literal('')),
  phone: z.string().max(40).nullish(),
  pixKey: z.string().max(160).nullish(),
  bankInfo: z.string().max(500).nullish(),
  notes: z.string().max(1000).nullish(),
});
const UpdateSchema = CreateSchema.partial().extend({ active: z.boolean().optional() });

@ApiTags('owners')
@ApiBearerAuth()
@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @RequireCapability('owner:read')
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.owners.findAll(tenantId);
  }

  @RequireCapability('owner:read')
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.owners.findOne(tenantId, id);
  }

  @RequireCapability('owner:manage')
  @Post()
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    return this.owners.create(tenantId, CreateSchema.parse(body));
  }

  @RequireCapability('owner:manage')
  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.owners.update(tenantId, id, UpdateSchema.parse(body));
  }

  @RequireCapability('owner:manage')
  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.owners.remove(tenantId, id);
  }
}

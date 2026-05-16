import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

const CreatePropertySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default('BR'),
  timezone: z.string().default('America/Sao_Paulo'),
  currency: z.string().default('BRL'),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.property.findMany({
        include: { _count: { select: { rooms: true, roomTypes: true } } },
        orderBy: { name: 'asc' },
      }),
    );
  }

  @Get(':id')
  getOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.property.findUniqueOrThrow({
        where: { id },
        include: { roomTypes: true, rooms: true, channelConnections: true },
      }),
    );
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    const data = CreatePropertySchema.parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.property.create({ data: { ...data, tenantId } }),
    );
  }

  @Put(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = CreatePropertySchema.partial().parse(body);
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.property.update({ where: { id }, data }),
    );
  }
}

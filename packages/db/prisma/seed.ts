/**
 * Seed de desenvolvimento.
 * Cria 1 tenant demo, 1 propriedade, 2 tipos de quarto, 4 quartos,
 * 14 dias de disponibilidade e 2 reservas de exemplo.
 *
 * Uso: pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import { addDays, format, startOfDay } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');

  // Limpa em ordem de FK
  await prisma.availabilityCalendar.deleteMany();
  await prisma.reservationGuest.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.rateCalendar.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.channelRoomMapping.deleteMany();
  await prisma.channelConnection.deleteMany();
  await prisma.property.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Pousada Adelina',
      slug: 'adelina',
      plan: 'pro',
    },
  });

  const property = await prisma.property.create({
    data: {
      tenantId: tenant.id,
      name: 'Pousada Adelina — Sede',
      slug: 'sede',
      address: 'Rua das Flores, 123',
      city: 'Paraty',
      state: 'RJ',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
    },
  });

  const standard = await prisma.roomType.create({
    data: {
      propertyId: property.id,
      name: 'Standard Casal',
      code: 'STD',
      capacity: 2,
      beds: 1,
      basePrice: 280.0,
    },
  });

  const suite = await prisma.roomType.create({
    data: {
      propertyId: property.id,
      name: 'Suíte Master',
      code: 'SM',
      capacity: 4,
      beds: 2,
      basePrice: 480.0,
    },
  });

  const rooms = await Promise.all([
    prisma.room.create({ data: { propertyId: property.id, roomTypeId: standard.id, code: '101', floor: 1 } }),
    prisma.room.create({ data: { propertyId: property.id, roomTypeId: standard.id, code: '102', floor: 1 } }),
    prisma.room.create({ data: { propertyId: property.id, roomTypeId: suite.id, code: '201', floor: 2 } }),
    prisma.room.create({ data: { propertyId: property.id, roomTypeId: suite.id, code: '202', floor: 2 } }),
  ]);

  // 30 dias de availability
  const today = startOfDay(new Date());
  for (const room of rooms) {
    const data = Array.from({ length: 30 }).map((_, i) => ({
      roomId: room.id,
      date: addDays(today, i),
      status: 'available' as const,
      source: 'internal' as const,
    }));
    await prisma.availabilityCalendar.createMany({ data });
  }

  // 2 hóspedes
  const guest1 = await prisma.guest.create({
    data: {
      tenantId: tenant.id,
      fullName: 'Maria Silva',
      documentType: 'cpf',
      document: '123.456.789-00',
      email: 'maria@example.com',
      phone: '+5511999999999',
    },
  });

  const guest2 = await prisma.guest.create({
    data: {
      tenantId: tenant.id,
      fullName: 'João Pereira',
      documentType: 'cpf',
      document: '987.654.321-00',
      email: 'joao@example.com',
    },
  });

  // Reserva 1 — direta, 3 noites no quarto 101
  const r1CheckIn = addDays(today, 2);
  const r1CheckOut = addDays(today, 5);
  const r1 = await prisma.reservation.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      code: 'ADL-2026-00001',
      guestId: guest1.id,
      channel: 'direct',
      checkIn: r1CheckIn,
      checkOut: r1CheckOut,
      adults: 2,
      totalAmount: 840.0,
      netAmount: 840.0,
      status: 'confirmed',
      paymentStatus: 'paid',
    },
  });
  await prisma.reservationRoom.create({
    data: {
      reservationId: r1.id,
      roomId: rooms[0]!.id,
      roomTypeId: standard.id,
      guestsCount: 2,
      nightlyRates: [
        { date: format(r1CheckIn, 'yyyy-MM-dd'), price: 280 },
        { date: format(addDays(r1CheckIn, 1), 'yyyy-MM-dd'), price: 280 },
        { date: format(addDays(r1CheckIn, 2), 'yyyy-MM-dd'), price: 280 },
      ],
    },
  });
  // Marca availability como reserved
  for (let i = 0; i < 3; i++) {
    await prisma.availabilityCalendar.update({
      where: { roomId_date: { roomId: rooms[0]!.id, date: addDays(r1CheckIn, i) } },
      data: { status: 'reserved', reservationId: r1.id, source: 'direct' },
    });
  }

  // Reserva 2 — Airbnb, 2 noites no quarto 201
  const r2CheckIn = addDays(today, 7);
  const r2CheckOut = addDays(today, 9);
  const r2 = await prisma.reservation.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      code: 'ADL-2026-00002',
      guestId: guest2.id,
      channel: 'airbnb',
      channelReservationId: 'HMABCD1234',
      checkIn: r2CheckIn,
      checkOut: r2CheckOut,
      adults: 2,
      totalAmount: 960.0,
      commissionAmount: 144.0, // 15%
      netAmount: 816.0,
      status: 'confirmed',
      paymentStatus: 'paid',
    },
  });
  await prisma.reservationRoom.create({
    data: {
      reservationId: r2.id,
      roomId: rooms[2]!.id,
      roomTypeId: suite.id,
      guestsCount: 2,
      nightlyRates: [
        { date: format(r2CheckIn, 'yyyy-MM-dd'), price: 480 },
        { date: format(addDays(r2CheckIn, 1), 'yyyy-MM-dd'), price: 480 },
      ],
    },
  });
  for (let i = 0; i < 2; i++) {
    await prisma.availabilityCalendar.update({
      where: { roomId_date: { roomId: rooms[2]!.id, date: addDays(r2CheckIn, i) } },
      data: { status: 'reserved', reservationId: r2.id, source: 'airbnb' },
    });
  }

  console.log('✅ Seed completo.');
  console.log(`   Tenant: ${tenant.id}`);
  console.log(`   Property: ${property.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

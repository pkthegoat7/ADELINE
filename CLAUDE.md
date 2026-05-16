# Adelina PMS — Contexto para Claude

> Leia isto antes de explorar. Evita re-descobrir o projeto.

## O que é
PMS (Property Management System) multi-tenant para pousadas/hotéis com **channel manager bidirecional iCal** (Airbnb + Booking).
Greenfield. Dono é iniciante em CLI/dev — explica passos com cuidado, nunca assuma conhecimento.

## Stack (NÃO sugerir mudar)
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`)
- **Backend** (`apps/api`): NestJS 10 + Fastify + Prisma 5 + BullMQ + node-ical + ical-generator
- **Frontend** (`apps/web`): Next.js 15 (App Router) + React 19 RC + Tailwind + TanStack Query
- **DB** (`packages/db`): Prisma + Postgres (Supabase Cloud) + RLS multi-tenant
- **Cache/jobs**: Redis (Upstash)
- **Auth**: Supabase JWT (HS256, secret em `SUPABASE_JWT_SECRET`)

## Decisões arquiteturais (NÃO refatorar sem pedir)
1. **Multi-tenant via RLS** com `app.current_tenant` GUC. Toda query passa por `prisma.withTenant(tenantId, tx => ...)` que faz `SET LOCAL`.
2. **`availability_calendar` é a fonte da verdade** de bloqueio. UM lugar muta: `AvailabilityService.reserveRoom/blockRoom/releaseReservation`.
3. **Anti-overbooking**: `SELECT … FOR UPDATE` em transação + `UNIQUE(channel, channel_reservation_id)` para idempotência. Reconciliação noturna às 03:00 BRT.
4. **iCal é o protocolo padrão** de canal no MVP. APIs diretas (Booking Connectivity, Channex) ficam pra depois.
5. **Reservas inbound de canal sem dados completos** geram um **guest placeholder** com nome `"AIRBNB Guest (HMxxxx)"`.
6. **Feed iCal público** assinado com HMAC-SHA256 truncado em 32 chars (`ICAL_FEED_SECRET`). Cache 5min.

## Estrutura
```
packages/db/prisma/
  schema.prisma                      # 18 models, 13 enums
  migrations/.../migration.sql       # RLS policies + índices extras
  seed.ts                            # 1 tenant, 1 prop, 4 quartos, 2 reservas

apps/api/src/
  main.ts, app.module.ts
  common/prisma/                     # PrismaService.withTenant()
  common/decorators/                 # @TenantId(), @CurrentUser()
  modules/
    auth/                            # AuthGuard global JWT + @Public()
    tenants, properties, rooms, guests
    availability/                    # ⭐ AvailabilityService — único mutador de calendar
    reservations/                    # cria reserva → bloqueia avail → enfileira push
    channel-manager/                 # ⭐ ical-parser, ical-builder, sync-service,
                                     #    scheduler (cron 5min), pull/push processors,
                                     #    feed público em /api/ical/:roomId.ics

apps/web/src/
  app/(dashboard)/                   # layout sidebar + páginas:
    dashboard, calendar, reservations, channels
  components/calendar/Timeline.tsx   # ⭐ grid quartos × dias, células coloridas por canal
  lib/api.ts                         # fetch wrapper (anexar JWT no futuro)
```

## Comandos (sempre rodar da raiz)
```
pnpm install
pnpm db:generate          # após mudar schema
pnpm db:migrate           # cria migration + aplica
pnpm db:push              # sync sem migration (só dev)
pnpm db:seed              # reseta + popula demo
pnpm db:studio            # Prisma Studio em :5555
pnpm dev                  # API (3333) + Web (3000)
pnpm dev:api              # só API
pnpm dev:web              # só Web
pnpm typecheck            # tudo
```

## Setup do dono (sem Docker — escolha dele)
- Postgres = Supabase Cloud (free tier)
- Redis = Upstash (free tier)
- Não tenta sugerir Docker/Supabase local de novo — ele tentou, deu erro de elevation.

## Padrões de código (seguir)
- **Validação**: Zod nos controllers (`Schema.parse(body)`), nunca class-validator.
- **DTOs**: schemas Zod inline no próprio controller (módulos são pequenos, sem necessidade de pasta `dto/`).
- **Queries tenant-scoped**: SEMPRE via `prisma.withTenant(tenantId, tx => tx.foo.bar(...))`. Nunca `prisma.foo.bar()` direto em endpoints autenticados.
- **Datas**: `date-fns` no JS, `@db.Date` no Prisma. Lógica de noites: check-out exclusivo (`addDays(end, -1)`).
- **Money**: `Decimal(10,2)` no Prisma. Nunca float.
- **IDs**: UUID v4 em `id`, código humano (`ADL-2026-00001`) em `code`.
- **Comentários**: só pro "porquê". Nunca pro "o quê".
- **Imports do db**: `import { ... } from '@adelina/db'` (workspace alias).

## Convenções de nomenclatura
- Tabelas snake_case (`availability_calendar`), modelos PascalCase (`AvailabilityCalendar`).
- Enums Postgres em snake_case (`reservation_status`), valores também (`checked_in`).
- Campos no Prisma camelCase, mapeados via `@map("snake_case")`.

## Pegadinhas conhecidas
- **RLS bypass**: workers usam service role e DEVEM passar `tenantId` explicitamente. Nunca confiar em RLS para jobs.
- **iCal date semantics**: `DTEND` é exclusivo (dia do checkout não bloqueia). `eachDayOfInterval` precisa de `addDays(to, -1)`.
- **Idempotência inbound**: cheque `(channel, channelReservationId)` UNIQUE antes de criar reserva nova.
- **`SELECT FOR UPDATE`** só funciona dentro de transação Prisma; `withTenant` já abre uma.
- **Decimal** do Prisma vira string no JSON; multiplique com `Number(d)` ou use `decimal.js`.
- **Next 15 + React 19 RC**: pode dar warning de peer; ignorar.

## Roadmap (referência)
- ✅ F1 Core (multi-tenant, propriedades, reservas, calendário)
- ✅ F2 Channel Manager (iCal bi, anti-overbooking, reconcile)
- ⬜ F3 Operação (FNRH digital + WhatsApp, housekeeping app, pagamentos Pix/cartão)
- ⬜ F4 Inteligência (pricing dinâmico, RevPAR/ADR, automações)

## Quando o dono pede algo novo
1. Confirma escopo se for grande.
2. Reusa serviço existente — NÃO duplica lógica de availability/reservation/channel.
3. Se mexer em schema: edita `schema.prisma` → `pnpm db:migrate` → atualiza seed se afeta dados demo.
4. Não cria docs `.md` extras a menos que peçam.
5. Sempre verifica se a feature deve respeitar RLS (resposta: quase sempre sim).

## Idioma
- Código e identifiers: inglês.
- Mensagens UI, textos no banco (enums sem tradução), respostas ao dono: **português BR**.

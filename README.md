# Adelina PMS

Property Management System multi-tenant para pousadas e hotéis, com **channel manager bidirecional** integrado a Airbnb e Booking via iCal.

## Arquitetura

```
adelina-pms/
├── apps/
│   ├── api/      → NestJS + Fastify + Prisma + BullMQ (REST + worker)
│   └── web/      → Next.js 15 + Tailwind + TanStack Query
└── packages/
    └── db/       → Prisma schema, migrations, seed, RLS
```

**Stack:** TypeScript • Postgres (Supabase) • Redis (BullMQ) • RLS multi-tenant

---

## Pré-requisitos

- **Node 20+** e **pnpm 9+** (`npm i -g pnpm`)
- **Docker Desktop** (para Supabase local + Redis)
- **Supabase CLI** (`npm i -g supabase`)

## Setup inicial

```bash
# 1. Clone & instale
pnpm install

# 2. Copie variáveis de ambiente
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local

# 3. Suba Supabase local (Postgres + Auth + Realtime + Storage)
supabase init   # primeira vez
supabase start  # demora alguns minutos na 1ª vez

# Saída: anote SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET
# e cole no .env

# 4. Suba Redis
docker run -d --name adelina-redis -p 6379:6379 redis:7-alpine

# 5. Gere o Prisma client + roda migrations + seed
pnpm db:generate
pnpm db:migrate          # aplica schema + RLS policies
pnpm db:seed             # popula tenant demo, propriedade, quartos, 2 reservas

# 6. Anote o property.id mostrado pelo seed e cole em apps/web/.env.local:
#    NEXT_PUBLIC_DEMO_PROPERTY_ID=<uuid>

# 7. Suba tudo em paralelo
pnpm dev
# → API:   http://localhost:3333/api/docs   (Swagger)
# → Web:   http://localhost:3000
```

---

## Comandos úteis

| Comando | O que faz |
|---|---|
| `pnpm dev` | API + Web em paralelo |
| `pnpm dev:api` | Só API + worker |
| `pnpm dev:web` | Só frontend |
| `pnpm db:studio` | Prisma Studio (UI do banco) |
| `pnpm db:migrate` | Cria nova migration |
| `pnpm db:push` | Sincroniza schema sem migration (dev only) |
| `pnpm db:seed` | Reseta + popula dados demo |

---

## Channel Manager — fluxo de uso

### 1. Conectar Airbnb (iCal)

No Airbnb: **Listing → Disponibilidade → Sincronizar calendários → Exportar calendário**.
Copie a URL `.ics`.

```bash
curl -X POST http://localhost:3333/api/channels \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "<uuid>",
    "channel": "airbnb",
    "icalImportUrl": "https://www.airbnb.com/calendar/ical/12345.ics?s=abc",
    "roomMappings": [
      { "roomId": "<uuid-quarto>", "externalRoomId": "12345", "externalRoomName": "Quarto 101" }
    ]
  }'
```

A partir daí, o scheduler puxa a cada **5 min**. Você pode forçar via `POST /api/channels/{id}/sync`.

### 2. Expor seu calendário para o Airbnb importar

```bash
curl http://localhost:3333/api/channels/<id>/export-urls \
  -H "Authorization: Bearer <jwt>"
# Retorna URLs assinadas .ics — cole no painel do Airbnb (Importar calendário).
```

### 3. Como funciona o anti-overbooking

- Toda reserva inbound passa por `AvailabilityService.reserveRoom`, que:
  1. Abre transação,
  2. Faz `SELECT … FOR UPDATE` nas linhas (`room_id`, `date`),
  3. Aborta com **HTTP 409** se qualquer dia já está `reserved`/`blocked` por outra origem.
- Idempotência: `(channel, channel_reservation_id)` é UNIQUE — webhooks/polls duplicados viram no-op.
- Reconciliação noturna (cron 03:00 BRT) ignora hash e reprocessa tudo — pega drift silencioso.

---

## Multi-tenancy (RLS)

Toda tabela tenant-scoped tem **Row Level Security** habilitado. A API seta o tenant a cada request:

```ts
await prisma.withTenant(tenantId, (tx) => tx.reservation.findMany());
```

Isso emite `SET LOCAL app.current_tenant = '<uuid>'` no início da transação e o Postgres
filtra todas as queries automaticamente. Workers usam `service_role` (bypass RLS) e
informam o tenant explicitamente.

---

## Endpoints principais (Swagger em `/api/docs`)

| Método | Path | Descrição |
|---|---|---|
| GET  | `/api/me` | Contexto do usuário/tenant |
| GET  | `/api/properties` | Lista propriedades |
| POST | `/api/properties` | Cria propriedade |
| GET  | `/api/rooms?propertyId=` | Lista quartos |
| GET  | `/api/availability/calendar?propertyId=&from=&to=` | Grade quartos × dias |
| POST | `/api/availability/block` | Bloqueio manual |
| GET  | `/api/reservations` | Lista reservas |
| POST | `/api/reservations` | Cria reserva (com anti-overbooking) |
| POST | `/api/reservations/:id/check-in` | Check-in |
| POST | `/api/reservations/:id/check-out` | Check-out (gera task de housekeeping) |
| POST | `/api/reservations/:id/cancel` | Cancela + libera availability + push |
| GET  | `/api/channels` | Lista conexões de canal |
| POST | `/api/channels` | Conecta canal (iCal) |
| POST | `/api/channels/:id/sync` | Pull manual |
| GET  | `/api/channels/:id/logs` | Histórico de sync |
| GET  | `/api/channels/:id/export-urls` | URLs iCal assinadas para canais externos |
| GET  | `/api/ical/:roomId.ics?token=` | Feed iCal público (consumido pelos canais) |

---

## Roadmap

- [x] **F1 — Core:** Multi-tenant, propriedades, quartos, reservas, calendário
- [x] **F2 — Channel Manager:** iCal bidirecional, anti-overbooking, reconciliação
- [ ] **F3 — Operação:** Check-in digital (FNRH+WhatsApp), housekeeping app, pagamentos
- [ ] **F4 — Inteligência:** Pricing dinâmico, dashboards RevPAR/ADR, automações

---

## Deploy (sugestão)

| Componente | Provedor recomendado |
|---|---|
| Frontend | Vercel |
| API + Worker | Railway / Fly.io / Render |
| Postgres | Supabase Cloud (RLS first-class) ou Neon |
| Redis | Upstash (serverless) ou Railway |
| Storage | Supabase Storage / Cloudflare R2 |
| Observability | Sentry + Better Stack |

Para subir:

```bash
# 1. Criar projeto Supabase Cloud, copiar URL + keys
# 2. Apontar DATABASE_URL/DIRECT_URL para o Supabase Cloud
pnpm --filter @adelina/db prisma migrate deploy

# 3. Deploy API
railway up   # ou fly deploy

# 4. Deploy Web
vercel deploy --prod
```

---

## Licença

Proprietário © 2026 Adelina Pousadas.
